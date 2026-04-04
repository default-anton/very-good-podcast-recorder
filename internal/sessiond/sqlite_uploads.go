package sessiond

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func (s *store) startTrack(ctx context.Context, rawCookie string, request startTrackRequest) (recordingTrackResponse, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	claim, err := s.requireActiveClaim(ctx, rawCookie)
	if err != nil {
		return recordingTrackResponse{}, 0, err
	}
	request = normalizeStartTrackRequest(request)
	if err := validateStartTrackRequest(request); err != nil {
		return recordingTrackResponse{}, 0, err
	}

	snapshot, err := s.loadSnapshot(ctx)
	if err != nil {
		return recordingTrackResponse{}, 0, err
	}
	if !snapshot.RecordingEpochID.Valid || request.RecordingEpochID != snapshot.RecordingEpochID.String {
		return recordingTrackResponse{}, 0, requestConflict(
			"recording_epoch_mismatch",
			fmt.Sprintf("track %s targets recording epoch %s, but session %s is on %s", request.RecordingTrackID, request.RecordingEpochID, s.config.SessionID, snapshot.RecordingEpochID.String),
		)
	}

	existingTrack, err := s.loadRecordingTrack(ctx, request.RecordingTrackID)
	if err != nil {
		return recordingTrackResponse{}, 0, err
	}
	if existingTrack != nil {
		if !startTrackMatchesRequest(*existingTrack, s.config.SessionID, claim.ParticipantSeatID, request) {
			return recordingTrackResponse{}, 0, requestConflict(
				"track_conflict",
				fmt.Sprintf("track %s already exists with different fields", request.RecordingTrackID),
			)
		}
		return recordingTrackResponseFromRow(*existingTrack, snapshot.RecordingEpochID.String), http.StatusOK, nil
	}

	if snapshot.RecordingState != recordingStateRecording {
		return recordingTrackResponse{}, 0, requestConflict(
			"recording_not_accepting_tracks",
			fmt.Sprintf("session %s is in recording state %s; new tracks may only start while recording", s.config.SessionID, snapshot.RecordingState),
		)
	}

	duplicateSegmentTrackID, err := s.loadSegmentTrackID(ctx, claim.ParticipantSeatID, request.SourceInstanceID, request.SegmentIndex)
	if err != nil {
		return recordingTrackResponse{}, 0, err
	}
	if duplicateSegmentTrackID != "" {
		return recordingTrackResponse{}, 0, requestConflict(
			"segment_conflict",
			fmt.Sprintf("seat %s already has segment %d for source instance %s as track %s", claim.ParticipantSeatID, request.SegmentIndex, request.SourceInstanceID, duplicateSegmentTrackID),
		)
	}

	now := timestampNow()
	track := recordingTrackRow{
		ID:                     request.RecordingTrackID,
		ParticipantSeatID:      claim.ParticipantSeatID,
		SessionID:              s.config.SessionID,
		Source:                 request.Source,
		SourceInstanceID:       request.SourceInstanceID,
		CaptureGroupID:         toNullString(request.CaptureGroupID),
		Kind:                   request.Kind,
		SegmentIndex:           request.SegmentIndex,
		MimeType:               request.MimeType,
		CaptureStartOffsetUS:   request.CaptureStartOffsetUS,
		ClockSyncUncertaintyUS: request.ClockSyncUncertaintyUS,
		State:                  "recording",
		CreatedAt:              now,
		UpdatedAt:              now,
	}

	if _, err := s.db.ExecContext(
		ctx,
		`insert into recording_tracks (
			id,
			participant_seat_id,
			session_id,
			source,
			source_instance_id,
			capture_group_id,
			kind,
			segment_index,
			mime_type,
			capture_start_offset_us,
			capture_end_offset_us,
			clock_sync_uncertainty_us,
			state,
			expected_chunk_count,
			created_at,
			updated_at
		) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, ?, null, ?, ?)`,
		track.ID,
		track.ParticipantSeatID,
		track.SessionID,
		track.Source,
		track.SourceInstanceID,
		nullStringValue(track.CaptureGroupID),
		track.Kind,
		track.SegmentIndex,
		track.MimeType,
		track.CaptureStartOffsetUS,
		track.ClockSyncUncertaintyUS,
		track.State,
		track.CreatedAt,
		track.UpdatedAt,
	); err != nil {
		return recordingTrackResponse{}, 0, fmt.Errorf("insert recording track %s: %w", track.ID, err)
	}
	if err := s.syncTrackArtifacts(ctx, track.ID); err != nil {
		return recordingTrackResponse{}, 0, err
	}

	return recordingTrackResponseFromRow(track, snapshot.RecordingEpochID.String), http.StatusCreated, nil
}

func (s *store) uploadChunk(
	ctx context.Context,
	rawCookie string,
	recordingTrackID string,
	chunkIndex int,
	contentType string,
	declaredLength int64,
	sha256Header string,
	chunkBytes []byte,
) (uploadChunkResponse, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	claim, err := s.requireActiveClaim(ctx, rawCookie)
	if err != nil {
		return uploadChunkResponse{}, 0, err
	}
	recordingTrackID = strings.TrimSpace(recordingTrackID)
	if recordingTrackID == "" {
		return uploadChunkResponse{}, 0, requestBadRequest("invalid_request", "recording_track_id is required")
	}
	if declaredLength < 0 {
		return uploadChunkResponse{}, 0, requestBadRequest("invalid_request", "Content-Length header is required")
	}
	if int64(len(chunkBytes)) != declaredLength {
		return uploadChunkResponse{}, 0, requestBadRequest(
			"invalid_request",
			fmt.Sprintf("declared Content-Length %d does not match received body size %d", declaredLength, len(chunkBytes)),
		)
	}

	track, err := s.loadRecordingTrack(ctx, recordingTrackID)
	if err != nil {
		return uploadChunkResponse{}, 0, err
	}
	if track == nil {
		return uploadChunkResponse{}, 0, requestNotFound("track_not_found", fmt.Sprintf("track %s does not exist", recordingTrackID))
	}
	if track.ParticipantSeatID != claim.ParticipantSeatID {
		return uploadChunkResponse{}, 0, requestForbidden(
			"track_access_denied",
			fmt.Sprintf("seat %s may not upload chunks for track %s", claim.ParticipantSeatID, recordingTrackID),
		)
	}
	contentType = strings.TrimSpace(contentType)
	if contentType != track.MimeType {
		return uploadChunkResponse{}, 0, requestBadRequest(
			"invalid_request",
			fmt.Sprintf("Content-Type %q must match track mime_type %q", contentType, track.MimeType),
		)
	}

	actualDigest := sha256.Sum256(chunkBytes)
	actualSHA256Hex := hex.EncodeToString(actualDigest[:])
	sha256Header = strings.TrimSpace(sha256Header)
	if !isValidLowerHexSHA256(sha256Header) {
		return uploadChunkResponse{}, 0, requestBadRequest("invalid_request", "X-Chunk-Sha256 must be a lowercase hex SHA-256 digest")
	}
	if sha256Header != actualSHA256Hex {
		return uploadChunkResponse{}, 0, requestBadRequest(
			"invalid_request",
			fmt.Sprintf("X-Chunk-Sha256 %s does not match the uploaded bytes", sha256Header),
		)
	}

	existingChunk, err := s.loadTrackChunk(ctx, recordingTrackID, chunkIndex)
	if err != nil {
		return uploadChunkResponse{}, 0, err
	}
	if existingChunk != nil {
		if existingChunk.ByteSize != int64(len(chunkBytes)) || existingChunk.SHA256Hex != actualSHA256Hex {
			return uploadChunkResponse{}, 0, requestConflict(
				"chunk_conflict",
				fmt.Sprintf("chunk %d for track %s already exists with different content", chunkIndex, recordingTrackID),
			)
		}
		return uploadChunkResponse{
			RecordingTrackID: recordingTrackID,
			ChunkIndex:       chunkIndex,
			ByteSize:         existingChunk.ByteSize,
			SHA256Hex:        existingChunk.SHA256Hex,
			Status:           "duplicate",
		}, http.StatusOK, nil
	}

	snapshot, err := s.loadSnapshot(ctx)
	if err != nil {
		return uploadChunkResponse{}, 0, err
	}
	if snapshot.RecordingState != recordingStateRecording && snapshot.RecordingState != recordingStateDraining {
		return uploadChunkResponse{}, 0, requestConflict(
			"recording_not_accepting_chunks",
			fmt.Sprintf("session %s is in recording state %s; chunk uploads are only accepted while recording or draining", s.config.SessionID, snapshot.RecordingState),
		)
	}
	if track.State != "recording" && track.State != "uploading" {
		return uploadChunkResponse{}, 0, requestConflict(
			"track_not_accepting_chunks",
			fmt.Sprintf("track %s is in state %s; chunk uploads are only accepted while recording or uploading", recordingTrackID, track.State),
		)
	}
	if track.ExpectedChunkCount.Valid && chunkIndex >= int(track.ExpectedChunkCount.Int64) {
		return uploadChunkResponse{}, 0, requestConflict(
			"chunk_out_of_range",
			fmt.Sprintf("chunk %d is outside expected_chunk_count %d for track %s", chunkIndex, track.ExpectedChunkCount.Int64, recordingTrackID),
		)
	}

	storagePath, err := chunkStoragePath(*track, chunkIndex)
	if err != nil {
		return uploadChunkResponse{}, 0, err
	}
	filePath, err := artifactPathOnDisk(s.config.ArtifactRoot, storagePath)
	if err != nil {
		return uploadChunkResponse{}, 0, err
	}
	if err := ensurePrivateDirectory(filepath.Dir(filePath)); err != nil {
		return uploadChunkResponse{}, 0, fmt.Errorf("prepare chunk directory for track %s: %w", recordingTrackID, err)
	}
	if err := writeChunkFile(filePath, chunkBytes); err != nil {
		return uploadChunkResponse{}, 0, fmt.Errorf("write chunk file for track %s chunk %d: %w", recordingTrackID, chunkIndex, err)
	}

	chunkID, err := randomID("chk")
	if err != nil {
		_ = os.Remove(filePath)
		return uploadChunkResponse{}, 0, fmt.Errorf("mint chunk id for track %s chunk %d: %w", recordingTrackID, chunkIndex, err)
	}
	createdAt := timestampNow()
	if _, err := s.db.ExecContext(
		ctx,
		`insert into track_chunks (id, recording_track_id, chunk_index, storage_path, byte_size, sha256_hex, created_at)
		 values (?, ?, ?, ?, ?, ?, ?)`,
		chunkID,
		recordingTrackID,
		chunkIndex,
		storagePath,
		int64(len(chunkBytes)),
		actualSHA256Hex,
		createdAt,
	); err != nil {
		_ = os.Remove(filePath)
		return uploadChunkResponse{}, 0, fmt.Errorf("insert track chunk %s/%d: %w", recordingTrackID, chunkIndex, err)
	}

	if err := s.maybeCompleteTrack(ctx, track); err != nil {
		return uploadChunkResponse{}, 0, err
	}
	if err := s.maybeAdvanceSessionToStopped(ctx); err != nil {
		return uploadChunkResponse{}, 0, err
	}
	if err := s.syncTrackArtifacts(ctx, recordingTrackID); err != nil {
		return uploadChunkResponse{}, 0, err
	}

	return uploadChunkResponse{
		RecordingTrackID: recordingTrackID,
		ChunkIndex:       chunkIndex,
		ByteSize:         int64(len(chunkBytes)),
		SHA256Hex:        actualSHA256Hex,
		Status:           "stored",
	}, http.StatusCreated, nil
}

func (s *store) finishTrack(ctx context.Context, rawCookie string, recordingTrackID string, request finishTrackRequest) (finishTrackResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	claim, err := s.requireActiveClaim(ctx, rawCookie)
	if err != nil {
		return finishTrackResponse{}, err
	}
	recordingTrackID = strings.TrimSpace(recordingTrackID)
	if recordingTrackID == "" {
		return finishTrackResponse{}, requestBadRequest("invalid_request", "recording_track_id is required")
	}
	if request.ExpectedChunkCount < 0 {
		return finishTrackResponse{}, requestBadRequest("invalid_request", "expected_chunk_count must be >= 0")
	}

	track, err := s.loadRecordingTrack(ctx, recordingTrackID)
	if err != nil {
		return finishTrackResponse{}, err
	}
	if track == nil {
		return finishTrackResponse{}, requestNotFound("track_not_found", fmt.Sprintf("track %s does not exist", recordingTrackID))
	}
	if track.ParticipantSeatID != claim.ParticipantSeatID {
		return finishTrackResponse{}, requestForbidden(
			"track_access_denied",
			fmt.Sprintf("seat %s may not finish track %s", claim.ParticipantSeatID, recordingTrackID),
		)
	}
	if request.CaptureEndOffsetUS < track.CaptureStartOffsetUS {
		return finishTrackResponse{}, requestBadRequest(
			"invalid_request",
			fmt.Sprintf("capture_end_offset_us %d must be >= capture_start_offset_us %d", request.CaptureEndOffsetUS, track.CaptureStartOffsetUS),
		)
	}

	chunks, err := s.loadTrackChunks(ctx, recordingTrackID)
	if err != nil {
		return finishTrackResponse{}, err
	}
	snapshot, err := s.loadSnapshot(ctx)
	if err != nil {
		return finishTrackResponse{}, err
	}
	if track.ExpectedChunkCount.Valid {
		if track.ExpectedChunkCount.Int64 != int64(request.ExpectedChunkCount) || !track.CaptureEndOffsetUS.Valid || track.CaptureEndOffsetUS.Int64 != request.CaptureEndOffsetUS {
			return finishTrackResponse{}, requestConflict(
				"finish_conflict",
				fmt.Sprintf("finish for track %s already exists with different fields", recordingTrackID),
			)
		}
		return finishTrackResponseFromRow(*track, snapshot.RecordingEpochID.String, request.ExpectedChunkCount, len(chunks), currentTrackState(*track, len(chunks))), nil
	}
	if snapshot.RecordingState != recordingStateRecording && snapshot.RecordingState != recordingStateDraining {
		return finishTrackResponse{}, requestConflict(
			"recording_not_accepting_finishes",
			fmt.Sprintf("session %s is in recording state %s; track finish is only accepted while recording or draining", s.config.SessionID, snapshot.RecordingState),
		)
	}
	if track.State != "recording" && track.State != "uploading" {
		return finishTrackResponse{}, requestConflict(
			"track_not_finishable",
			fmt.Sprintf("track %s is in state %s; finish is only accepted while recording or uploading", recordingTrackID, track.State),
		)
	}
	for _, chunk := range chunks {
		if chunk.ChunkIndex >= request.ExpectedChunkCount {
			return finishTrackResponse{}, requestConflict(
				"finish_conflict",
				fmt.Sprintf("track %s already has chunk %d beyond expected_chunk_count %d", recordingTrackID, chunk.ChunkIndex, request.ExpectedChunkCount),
			)
		}
	}

	track.ExpectedChunkCount = sql.NullInt64{Int64: int64(request.ExpectedChunkCount), Valid: true}
	track.CaptureEndOffsetUS = sql.NullInt64{Int64: request.CaptureEndOffsetUS, Valid: true}
	track.State = currentTrackState(*track, len(chunks))
	track.UpdatedAt = timestampNow()
	if _, err := s.db.ExecContext(
		ctx,
		`update recording_tracks
		 set expected_chunk_count = ?,
		     capture_end_offset_us = ?,
		     state = ?,
		     updated_at = ?
		 where id = ?`,
		track.ExpectedChunkCount.Int64,
		track.CaptureEndOffsetUS.Int64,
		track.State,
		track.UpdatedAt,
		track.ID,
	); err != nil {
		return finishTrackResponse{}, fmt.Errorf("finish track %s: %w", recordingTrackID, err)
	}
	if err := s.maybeAdvanceSessionToStopped(ctx); err != nil {
		return finishTrackResponse{}, err
	}
	if err := s.syncTrackArtifacts(ctx, recordingTrackID); err != nil {
		return finishTrackResponse{}, err
	}

	return finishTrackResponseFromRow(*track, snapshot.RecordingEpochID.String, request.ExpectedChunkCount, len(chunks), track.State), nil
}

func normalizeStartTrackRequest(request startTrackRequest) startTrackRequest {
	request.RecordingTrackID = strings.TrimSpace(request.RecordingTrackID)
	request.RecordingEpochID = strings.TrimSpace(request.RecordingEpochID)
	request.Source = strings.TrimSpace(request.Source)
	request.SourceInstanceID = strings.TrimSpace(request.SourceInstanceID)
	request.Kind = strings.TrimSpace(request.Kind)
	request.MimeType = strings.TrimSpace(request.MimeType)
	if request.CaptureGroupID != nil {
		trimmed := strings.TrimSpace(*request.CaptureGroupID)
		request.CaptureGroupID = &trimmed
	}
	return request
}

func validateStartTrackRequest(request startTrackRequest) error {
	if request.RecordingTrackID == "" {
		return requestBadRequest("invalid_request", "recording_track_id is required")
	}
	if request.RecordingEpochID == "" {
		return requestBadRequest("invalid_request", "recording_epoch_id is required")
	}
	if request.SourceInstanceID == "" {
		return requestBadRequest("invalid_request", "source_instance_id is required")
	}
	if err := validateArtifactPathComponent("source_instance_id", request.SourceInstanceID); err != nil {
		return requestBadRequest("invalid_request", err.Error())
	}
	if request.Source != "mic" && request.Source != "camera" && request.Source != "screen" && request.Source != "system_audio" {
		return requestBadRequest("invalid_request", "source must be mic, camera, screen, or system_audio")
	}
	if request.Kind != "audio" && request.Kind != "video" {
		return requestBadRequest("invalid_request", "kind must be audio or video")
	}
	if request.SegmentIndex < 0 {
		return requestBadRequest("invalid_request", "segment_index must be >= 0")
	}
	if request.CaptureStartOffsetUS < 0 {
		return requestBadRequest("invalid_request", "capture_start_offset_us must be >= 0")
	}
	if request.ClockSyncUncertaintyUS < 0 {
		return requestBadRequest("invalid_request", "clock_sync_uncertainty_us must be >= 0")
	}
	if request.CaptureGroupID != nil && *request.CaptureGroupID == "" {
		return requestBadRequest("invalid_request", "capture_group_id must be null or a non-empty string")
	}
	if err := validateSourceKindPair(request.Source, request.Kind); err != nil {
		return err
	}
	if err := validateTrackMimeType(request.Kind, request.MimeType); err != nil {
		return err
	}
	return nil
}

func validateSourceKindPair(source string, kind string) error {
	switch {
	case source == "mic" && kind == "audio":
		return nil
	case source == "camera" && kind == "video":
		return nil
	case source == "screen" && kind == "video":
		return nil
	case source == "system_audio" && kind == "audio":
		return nil
	default:
		return requestBadRequest("invalid_request", fmt.Sprintf("source %s may not use kind %s", source, kind))
	}
}

func validateTrackMimeType(kind string, rawMimeType string) error {
	mediaType, _, err := mime.ParseMediaType(strings.TrimSpace(rawMimeType))
	if err != nil {
		return requestBadRequest("invalid_request", fmt.Sprintf("mime_type must be a valid media type: %v", err))
	}
	switch {
	case kind == "audio" && mediaType == "audio/webm":
		return nil
	case kind == "video" && mediaType == "video/webm":
		return nil
	default:
		return requestBadRequest("invalid_request", fmt.Sprintf("mime_type %q does not match kind %s", rawMimeType, kind))
	}
}

func chunkFileExtension(rawMimeType string) (string, error) {
	mediaType, _, err := mime.ParseMediaType(strings.TrimSpace(rawMimeType))
	if err != nil {
		return "", requestBadRequest("invalid_request", fmt.Sprintf("mime_type must be a valid media type: %v", err))
	}
	switch mediaType {
	case "audio/webm", "video/webm":
		return ".webm", nil
	default:
		return "", requestBadRequest("invalid_request", fmt.Sprintf("mime_type %q is not supported for chunk persistence", rawMimeType))
	}
}

func (s *store) loadRecordingTrack(ctx context.Context, recordingTrackID string) (*recordingTrackRow, error) {
	row := s.db.QueryRowContext(
		ctx,
		`select id,
		        participant_seat_id,
		        session_id,
		        source,
		        source_instance_id,
		        capture_group_id,
		        kind,
		        segment_index,
		        mime_type,
		        capture_start_offset_us,
		        capture_end_offset_us,
		        clock_sync_uncertainty_us,
		        state,
		        expected_chunk_count,
		        created_at,
		        updated_at
		 from recording_tracks
		 where id = ?`,
		recordingTrackID,
	)

	var track recordingTrackRow
	if err := row.Scan(
		&track.ID,
		&track.ParticipantSeatID,
		&track.SessionID,
		&track.Source,
		&track.SourceInstanceID,
		&track.CaptureGroupID,
		&track.Kind,
		&track.SegmentIndex,
		&track.MimeType,
		&track.CaptureStartOffsetUS,
		&track.CaptureEndOffsetUS,
		&track.ClockSyncUncertaintyUS,
		&track.State,
		&track.ExpectedChunkCount,
		&track.CreatedAt,
		&track.UpdatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("load recording track %s: %w", recordingTrackID, err)
	}
	return &track, nil
}

func (s *store) loadSegmentTrackID(ctx context.Context, participantSeatID string, sourceInstanceID string, segmentIndex int) (string, error) {
	var trackID string
	err := s.db.QueryRowContext(
		ctx,
		`select id
		 from recording_tracks
		 where session_id = ? and participant_seat_id = ? and source_instance_id = ? and segment_index = ?`,
		s.config.SessionID,
		participantSeatID,
		sourceInstanceID,
		segmentIndex,
	).Scan(&trackID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("lookup existing segment for seat %s source instance %s segment %d: %w", participantSeatID, sourceInstanceID, segmentIndex, err)
	}
	return trackID, nil
}

func (s *store) loadTrackChunk(ctx context.Context, recordingTrackID string, chunkIndex int) (*trackChunkRow, error) {
	row := s.db.QueryRowContext(
		ctx,
		`select id, recording_track_id, chunk_index, storage_path, byte_size, sha256_hex, created_at
		 from track_chunks
		 where recording_track_id = ? and chunk_index = ?`,
		recordingTrackID,
		chunkIndex,
	)

	var chunk trackChunkRow
	if err := row.Scan(
		&chunk.ID,
		&chunk.RecordingTrackID,
		&chunk.ChunkIndex,
		&chunk.StoragePath,
		&chunk.ByteSize,
		&chunk.SHA256Hex,
		&chunk.CreatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("load track chunk %s/%d: %w", recordingTrackID, chunkIndex, err)
	}
	return &chunk, nil
}

func (s *store) loadTrackChunks(ctx context.Context, recordingTrackID string) ([]trackChunkRow, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`select id, recording_track_id, chunk_index, storage_path, byte_size, sha256_hex, created_at
		 from track_chunks
		 where recording_track_id = ?
		 order by chunk_index`,
		recordingTrackID,
	)
	if err != nil {
		return nil, fmt.Errorf("query track chunks for %s: %w", recordingTrackID, err)
	}
	defer rows.Close()

	var chunks []trackChunkRow
	for rows.Next() {
		var chunk trackChunkRow
		if err := rows.Scan(
			&chunk.ID,
			&chunk.RecordingTrackID,
			&chunk.ChunkIndex,
			&chunk.StoragePath,
			&chunk.ByteSize,
			&chunk.SHA256Hex,
			&chunk.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan track chunk for %s: %w", recordingTrackID, err)
		}
		chunks = append(chunks, chunk)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate track chunks for %s: %w", recordingTrackID, err)
	}
	return chunks, nil
}

func (s *store) maybeCompleteTrack(ctx context.Context, track *recordingTrackRow) error {
	if !track.ExpectedChunkCount.Valid {
		return nil
	}

	receivedChunkCount, err := s.countTrackChunks(ctx, track.ID)
	if err != nil {
		return err
	}
	newState := currentTrackState(*track, receivedChunkCount)
	if newState == track.State {
		return nil
	}

	track.State = newState
	track.UpdatedAt = timestampNow()
	if _, err := s.db.ExecContext(
		ctx,
		`update recording_tracks set state = ?, updated_at = ? where id = ?`,
		track.State,
		track.UpdatedAt,
		track.ID,
	); err != nil {
		return fmt.Errorf("update recording track %s state to %s: %w", track.ID, track.State, err)
	}
	return nil
}

func (s *store) countTrackChunks(ctx context.Context, recordingTrackID string) (int, error) {
	var count int
	if err := s.db.QueryRowContext(
		ctx,
		`select count(*) from track_chunks where recording_track_id = ?`,
		recordingTrackID,
	).Scan(&count); err != nil {
		return 0, fmt.Errorf("count track chunks for %s: %w", recordingTrackID, err)
	}
	return count, nil
}

func (s *store) maybeAdvanceSessionToStopped(ctx context.Context) error {
	snapshot, err := s.loadSnapshot(ctx)
	if err != nil {
		return err
	}
	if snapshot.RecordingState != recordingStateDraining {
		return nil
	}

	var openTrackCount int
	if err := s.db.QueryRowContext(
		ctx,
		`select count(*)
		 from recording_tracks
		 where session_id = ? and state in ('recording', 'uploading')`,
		s.config.SessionID,
	).Scan(&openTrackCount); err != nil {
		return fmt.Errorf("count open recording tracks for session %s: %w", s.config.SessionID, err)
	}
	if openTrackCount != 0 {
		return nil
	}

	if _, err := s.db.ExecContext(
		ctx,
		`update session_snapshot
		 set recording_state = ?, updated_at = ?
		 where session_id = ?`,
		recordingStateStopped,
		timestampNow(),
		s.config.SessionID,
	); err != nil {
		return fmt.Errorf("transition session snapshot to stopped: %w", err)
	}
	return nil
}

func recordingTrackResponseFromRow(track recordingTrackRow, recordingEpochID string) recordingTrackResponse {
	return recordingTrackResponse{
		RecordingTrackID:       track.ID,
		RecordingEpochID:       recordingEpochID,
		ParticipantSeatID:      track.ParticipantSeatID,
		SessionID:              track.SessionID,
		Source:                 track.Source,
		SourceInstanceID:       track.SourceInstanceID,
		CaptureGroupID:         nullableTextPointer(track.CaptureGroupID),
		Kind:                   track.Kind,
		SegmentIndex:           track.SegmentIndex,
		MimeType:               track.MimeType,
		CaptureStartOffsetUS:   track.CaptureStartOffsetUS,
		CaptureEndOffsetUS:     nullableInt64Pointer(track.CaptureEndOffsetUS),
		ClockSyncUncertaintyUS: track.ClockSyncUncertaintyUS,
		State:                  track.State,
	}
}

func finishTrackResponseFromRow(track recordingTrackRow, recordingEpochID string, expectedChunkCount int, receivedChunkCount int, state string) finishTrackResponse {
	return finishTrackResponse{
		RecordingTrackID:     track.ID,
		RecordingEpochID:     recordingEpochID,
		CaptureStartOffsetUS: track.CaptureStartOffsetUS,
		CaptureEndOffsetUS:   track.CaptureEndOffsetUS.Int64,
		ExpectedChunkCount:   expectedChunkCount,
		ReceivedChunkCount:   receivedChunkCount,
		State:                state,
	}
}

func currentTrackState(track recordingTrackRow, receivedChunkCount int) string {
	if track.ExpectedChunkCount.Valid && receivedChunkCount == int(track.ExpectedChunkCount.Int64) {
		return "complete"
	}
	if track.ExpectedChunkCount.Valid {
		return "uploading"
	}
	return track.State
}

func startTrackMatchesRequest(track recordingTrackRow, sessionID string, participantSeatID string, request startTrackRequest) bool {
	captureGroupMatches := !track.CaptureGroupID.Valid && request.CaptureGroupID == nil
	if track.CaptureGroupID.Valid && request.CaptureGroupID != nil {
		captureGroupMatches = track.CaptureGroupID.String == *request.CaptureGroupID
	}
	return track.ParticipantSeatID == participantSeatID &&
		track.SessionID == sessionID &&
		track.Source == request.Source &&
		track.SourceInstanceID == request.SourceInstanceID &&
		captureGroupMatches &&
		track.Kind == request.Kind &&
		track.SegmentIndex == request.SegmentIndex &&
		track.MimeType == request.MimeType &&
		track.CaptureStartOffsetUS == request.CaptureStartOffsetUS &&
		track.ClockSyncUncertaintyUS == request.ClockSyncUncertaintyUS
}

func writeChunkFile(path string, chunkBytes []byte) error {
	dir := filepath.Dir(path)
	tempFile, err := os.CreateTemp(dir, ".chunk-*")
	if err != nil {
		return err
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath)

	if _, err := tempFile.Write(chunkBytes); err != nil {
		tempFile.Close()
		return err
	}
	if err := tempFile.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tempPath, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tempPath, path); err != nil {
		return err
	}
	return nil
}

func isValidLowerHexSHA256(value string) bool {
	if len(value) != sha256.Size*2 {
		return false
	}
	if value != strings.ToLower(value) {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

func toNullString(value *string) sql.NullString {
	if value == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: *value, Valid: true}
}

func nullStringValue(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}
