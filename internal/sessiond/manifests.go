package sessiond

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

type sessionManifest struct {
	SchemaVersion    int                   `json:"schema_version"`
	SessionID        string                `json:"session_id"`
	RecordingEpochID string                `json:"recording_epoch_id"`
	RecordingState   string                `json:"recording_state"`
	RecordingHealth  string                `json:"recording_health"`
	StartedAt        *string               `json:"started_at"`
	StoppedAt        *string               `json:"stopped_at"`
	Seats            []sessionManifestSeat `json:"seats"`
}

type sessionManifestSeat struct {
	ParticipantSeatID       string                        `json:"participant_seat_id"`
	Role                    string                        `json:"role"`
	ExpectedBaselineSources []string                      `json:"expected_baseline_sources"`
	Tracks                  []sessionManifestTrackSummary `json:"tracks"`
}

type sessionManifestTrackSummary struct {
	RecordingTrackID     string  `json:"recording_track_id"`
	Source               string  `json:"source"`
	SourceInstanceID     string  `json:"source_instance_id"`
	CaptureGroupID       *string `json:"capture_group_id"`
	Kind                 string  `json:"kind"`
	SegmentIndex         int     `json:"segment_index"`
	ArtifactStatus       string  `json:"artifact_status"`
	ChunkCount           int     `json:"chunk_count"`
	Bytes                int64   `json:"bytes"`
	CaptureStartOffsetUS int64   `json:"capture_start_offset_us"`
	CaptureEndOffsetUS   *int64  `json:"capture_end_offset_us"`
	Path                 string  `json:"path"`
}

type trackManifest struct {
	SchemaVersion          int                   `json:"schema_version"`
	SessionID              string                `json:"session_id"`
	RecordingEpochID       string                `json:"recording_epoch_id"`
	ParticipantSeatID      string                `json:"participant_seat_id"`
	RecordingTrackID       string                `json:"recording_track_id"`
	Source                 string                `json:"source"`
	SourceInstanceID       string                `json:"source_instance_id"`
	CaptureGroupID         *string               `json:"capture_group_id"`
	Kind                   string                `json:"kind"`
	SegmentIndex           int                   `json:"segment_index"`
	ArtifactStatus         string                `json:"artifact_status"`
	MimeType               string                `json:"mime_type"`
	CaptureStartOffsetUS   int64                 `json:"capture_start_offset_us"`
	CaptureEndOffsetUS     *int64                `json:"capture_end_offset_us"`
	ClockSyncUncertaintyUS int64                 `json:"clock_sync_uncertainty_us"`
	ActualCaptureSettings  actualCaptureSettings `json:"actual_capture_settings"`
	Chunks                 []trackManifestChunk  `json:"chunks"`
	Salvage                trackManifestSalvage  `json:"salvage"`
}

type actualCaptureSettings struct {
	AudioSampleRateHz *int     `json:"audio_sample_rate_hz"`
	AudioChannelCount *int     `json:"audio_channel_count"`
	VideoWidth        *int     `json:"video_width"`
	VideoHeight       *int     `json:"video_height"`
	VideoFrameRate    *float64 `json:"video_frame_rate"`
}

type trackManifestChunk struct {
	ChunkIndex int    `json:"chunk_index"`
	File       string `json:"file"`
	Bytes      int64  `json:"bytes"`
	SHA256     string `json:"sha256"`
}

type trackManifestSalvage struct {
	MissingChunkRanges []missingChunkRange `json:"missing_chunk_ranges"`
	ErrorCode          *string             `json:"error_code"`
	ErrorMessage       *string             `json:"error_message"`
}

type missingChunkRange struct {
	StartChunkIndex int `json:"start_chunk_index"`
	EndChunkIndex   int `json:"end_chunk_index"`
}

type manifestSeatRow struct {
	ParticipantSeatID string
	Role              string
}

type manifestTrackSummaryRow struct {
	RecordingTrackID     string
	ParticipantSeatID    string
	Source               string
	SourceInstanceID     string
	CaptureGroupID       sql.NullString
	Kind                 string
	SegmentIndex         int
	CaptureStartOffsetUS int64
	CaptureEndOffsetUS   sql.NullInt64
	State                string
	ExpectedChunkCount   sql.NullInt64
	ChunkCount           int
	BytesTotal           int64
}

type recordingTrackRow struct {
	ID                     string
	ParticipantSeatID      string
	SessionID              string
	Source                 string
	SourceInstanceID       string
	CaptureGroupID         sql.NullString
	Kind                   string
	SegmentIndex           int
	MimeType               string
	CaptureStartOffsetUS   int64
	CaptureEndOffsetUS     sql.NullInt64
	ClockSyncUncertaintyUS int64
	State                  string
	ExpectedChunkCount     sql.NullInt64
	CreatedAt              string
	UpdatedAt              string
}

type trackChunkRow struct {
	ID               string
	RecordingTrackID string
	ChunkIndex       int
	StoragePath      string
	ByteSize         int64
	SHA256Hex        string
	CreatedAt        string
}

func (s *store) rebuildArtifacts(ctx context.Context) error {
	snapshot, err := s.loadSnapshot(ctx)
	if err != nil {
		return err
	}

	tracks, err := s.loadManifestTracks(ctx)
	if err != nil {
		return err
	}
	chunksByTrack, err := s.loadManifestChunks(ctx)
	if err != nil {
		return err
	}

	for _, track := range tracks {
		trackChunks := append([]trackChunkRow(nil), chunksByTrack[track.ID]...)
		sort.Slice(trackChunks, func(left int, right int) bool {
			return trackChunks[left].ChunkIndex < trackChunks[right].ChunkIndex
		})
		trackArtifactStatus := artifactStatusForTrack(track, trackChunks)
		if err := s.writeTrackManifest(snapshot.RecordingEpochID.String, track, trackChunks, trackArtifactStatus); err != nil {
			return err
		}
	}

	return s.writeSessionManifest(ctx, snapshot)
}

func (s *store) syncTrackArtifacts(ctx context.Context, recordingTrackID string) error {
	snapshot, err := s.loadSnapshot(ctx)
	if err != nil {
		return err
	}

	track, err := s.loadRecordingTrack(ctx, recordingTrackID)
	if err != nil {
		return err
	}
	if track == nil {
		return fmt.Errorf("load track manifest %s: track is missing", recordingTrackID)
	}
	chunks, err := s.loadTrackChunks(ctx, recordingTrackID)
	if err != nil {
		return err
	}
	trackArtifactStatus := artifactStatusForTrack(*track, chunks)
	if err := s.writeTrackManifest(snapshot.RecordingEpochID.String, *track, chunks, trackArtifactStatus); err != nil {
		return err
	}

	return s.writeSessionManifest(ctx, snapshot)
}

func (s *store) syncSessionArtifacts(ctx context.Context) error {
	snapshot, err := s.loadSnapshot(ctx)
	if err != nil {
		return err
	}

	return s.writeSessionManifest(ctx, snapshot)
}

func (s *store) writeSessionManifest(ctx context.Context, snapshot snapshotRow) error {
	trackSummaries, err := s.loadManifestTrackSummaries(ctx)
	if err != nil {
		return err
	}
	if !snapshot.RecordingEpochID.Valid && len(trackSummaries) == 0 {
		return nil
	}

	seats, err := s.loadManifestSeats(ctx)
	if err != nil {
		return err
	}

	session := sessionManifest{
		SchemaVersion:    1,
		SessionID:        s.config.SessionID,
		RecordingEpochID: snapshot.RecordingEpochID.String,
		RecordingState:   snapshot.RecordingState,
		RecordingHealth:  snapshot.RecordingHealth,
		StartedAt:        nullableString(snapshot.RecordingEpochStartedAt),
		StoppedAt:        stoppedAtForSnapshot(snapshot),
	}
	seatIndex := make(map[string]int, len(seats))
	for _, seat := range seats {
		seatIndex[seat.ParticipantSeatID] = len(session.Seats)
		session.Seats = append(session.Seats, sessionManifestSeat{
			ParticipantSeatID:       seat.ParticipantSeatID,
			Role:                    seat.Role,
			ExpectedBaselineSources: []string{"mic", "camera"},
			Tracks:                  []sessionManifestTrackSummary{},
		})
	}

	for _, track := range trackSummaries {
		trackDir, err := trackRelativeDirForSummary(track)
		if err != nil {
			return err
		}

		index, ok := seatIndex[track.ParticipantSeatID]
		if !ok {
			return fmt.Errorf("manifest seat %s for track %s is missing", track.ParticipantSeatID, track.RecordingTrackID)
		}
		session.Seats[index].Tracks = append(session.Seats[index].Tracks, sessionManifestTrackSummary{
			RecordingTrackID:     track.RecordingTrackID,
			Source:               track.Source,
			SourceInstanceID:     track.SourceInstanceID,
			CaptureGroupID:       nullableTextPointer(track.CaptureGroupID),
			Kind:                 track.Kind,
			SegmentIndex:         track.SegmentIndex,
			ArtifactStatus:       artifactStatusForTrackSummary(track),
			ChunkCount:           track.ChunkCount,
			Bytes:                track.BytesTotal,
			CaptureStartOffsetUS: track.CaptureStartOffsetUS,
			CaptureEndOffsetUS:   nullableInt64Pointer(track.CaptureEndOffsetUS),
			Path:                 trackDir,
		})
	}

	for index := range session.Seats {
		sort.Slice(session.Seats[index].Tracks, func(left int, right int) bool {
			leftTrack := session.Seats[index].Tracks[left]
			rightTrack := session.Seats[index].Tracks[right]
			if leftTrack.Source != rightTrack.Source {
				return leftTrack.Source < rightTrack.Source
			}
			if leftTrack.SourceInstanceID != rightTrack.SourceInstanceID {
				return leftTrack.SourceInstanceID < rightTrack.SourceInstanceID
			}
			return leftTrack.SegmentIndex < rightTrack.SegmentIndex
		})
	}

	sessionManifestPath, err := artifactPathOnDisk(s.config.ArtifactRoot, "session.json")
	if err != nil {
		return err
	}
	return writeJSONFile(sessionManifestPath, session)
}

func (s *store) loadManifestSeats(ctx context.Context) ([]manifestSeatRow, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`select id, role
		 from participant_seats
		 where session_id = ?
		 order by case role when 'host' then 0 else 1 end, display_name, id`,
		s.config.SessionID,
	)
	if err != nil {
		return nil, fmt.Errorf("query manifest seats for session %s: %w", s.config.SessionID, err)
	}
	defer rows.Close()

	var seats []manifestSeatRow
	for rows.Next() {
		var seat manifestSeatRow
		if err := rows.Scan(&seat.ParticipantSeatID, &seat.Role); err != nil {
			return nil, fmt.Errorf("scan manifest seat for session %s: %w", s.config.SessionID, err)
		}
		seats = append(seats, seat)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate manifest seats for session %s: %w", s.config.SessionID, err)
	}

	return seats, nil
}

func (s *store) loadManifestTracks(ctx context.Context) ([]recordingTrackRow, error) {
	rows, err := s.db.QueryContext(
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
		 where session_id = ?
		 order by participant_seat_id, source, source_instance_id, segment_index, created_at`,
		s.config.SessionID,
	)
	if err != nil {
		return nil, fmt.Errorf("query manifest tracks for session %s: %w", s.config.SessionID, err)
	}
	defer rows.Close()

	var tracks []recordingTrackRow
	for rows.Next() {
		var track recordingTrackRow
		if err := rows.Scan(
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
			return nil, fmt.Errorf("scan manifest track for session %s: %w", s.config.SessionID, err)
		}
		tracks = append(tracks, track)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate manifest tracks for session %s: %w", s.config.SessionID, err)
	}

	return tracks, nil
}

func (s *store) loadManifestChunks(ctx context.Context) (map[string][]trackChunkRow, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`select c.id,
		        c.recording_track_id,
		        c.chunk_index,
		        c.storage_path,
		        c.byte_size,
		        c.sha256_hex,
		        c.created_at
		 from track_chunks c
		 join recording_tracks t on t.id = c.recording_track_id
		 where t.session_id = ?
		 order by c.recording_track_id, c.chunk_index`,
		s.config.SessionID,
	)
	if err != nil {
		return nil, fmt.Errorf("query manifest chunks for session %s: %w", s.config.SessionID, err)
	}
	defer rows.Close()

	chunksByTrack := make(map[string][]trackChunkRow)
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
			return nil, fmt.Errorf("scan manifest chunk for session %s: %w", s.config.SessionID, err)
		}
		chunksByTrack[chunk.RecordingTrackID] = append(chunksByTrack[chunk.RecordingTrackID], chunk)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate manifest chunks for session %s: %w", s.config.SessionID, err)
	}

	return chunksByTrack, nil
}

func (s *store) loadManifestTrackSummaries(ctx context.Context) ([]manifestTrackSummaryRow, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`select t.id,
		        t.participant_seat_id,
		        t.source,
		        t.source_instance_id,
		        t.capture_group_id,
		        t.kind,
		        t.segment_index,
		        t.capture_start_offset_us,
		        t.capture_end_offset_us,
		        t.state,
		        t.expected_chunk_count,
		        coalesce(c.chunk_count, 0),
		        coalesce(c.bytes_total, 0)
		 from recording_tracks t
		 left join (
		   select recording_track_id,
		          count(*) as chunk_count,
		          coalesce(sum(byte_size), 0) as bytes_total
		   from track_chunks
		   group by recording_track_id
		 ) c on c.recording_track_id = t.id
		 where t.session_id = ?
		 order by t.participant_seat_id, t.source, t.source_instance_id, t.segment_index, t.created_at`,
		s.config.SessionID,
	)
	if err != nil {
		return nil, fmt.Errorf("query manifest track summaries for session %s: %w", s.config.SessionID, err)
	}
	defer rows.Close()

	var tracks []manifestTrackSummaryRow
	for rows.Next() {
		var track manifestTrackSummaryRow
		if err := rows.Scan(
			&track.RecordingTrackID,
			&track.ParticipantSeatID,
			&track.Source,
			&track.SourceInstanceID,
			&track.CaptureGroupID,
			&track.Kind,
			&track.SegmentIndex,
			&track.CaptureStartOffsetUS,
			&track.CaptureEndOffsetUS,
			&track.State,
			&track.ExpectedChunkCount,
			&track.ChunkCount,
			&track.BytesTotal,
		); err != nil {
			return nil, fmt.Errorf("scan manifest track summary for session %s: %w", s.config.SessionID, err)
		}
		tracks = append(tracks, track)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate manifest track summaries for session %s: %w", s.config.SessionID, err)
	}

	return tracks, nil
}

func (s *store) writeTrackManifest(recordingEpochID string, track recordingTrackRow, chunks []trackChunkRow, artifactStatus string) error {
	manifest := trackManifest{
		SchemaVersion:          1,
		SessionID:              track.SessionID,
		RecordingEpochID:       recordingEpochID,
		ParticipantSeatID:      track.ParticipantSeatID,
		RecordingTrackID:       track.ID,
		Source:                 track.Source,
		SourceInstanceID:       track.SourceInstanceID,
		CaptureGroupID:         nullableTextPointer(track.CaptureGroupID),
		Kind:                   track.Kind,
		SegmentIndex:           track.SegmentIndex,
		ArtifactStatus:         artifactStatus,
		MimeType:               track.MimeType,
		CaptureStartOffsetUS:   track.CaptureStartOffsetUS,
		CaptureEndOffsetUS:     nullableInt64Pointer(track.CaptureEndOffsetUS),
		ClockSyncUncertaintyUS: track.ClockSyncUncertaintyUS,
		ActualCaptureSettings:  actualCaptureSettings{},
		Salvage: trackManifestSalvage{
			MissingChunkRanges: missingChunkRangesFor(track, chunks),
		},
	}
	for _, chunk := range chunks {
		manifest.Chunks = append(manifest.Chunks, trackManifestChunk{
			ChunkIndex: chunk.ChunkIndex,
			File:       path.Base(chunk.StoragePath),
			Bytes:      chunk.ByteSize,
			SHA256:     chunk.SHA256Hex,
		})
	}

	trackDirRelative, err := trackRelativeDir(track)
	if err != nil {
		return err
	}
	trackDirOnDisk, err := artifactPathOnDisk(s.config.ArtifactRoot, trackDirRelative)
	if err != nil {
		return err
	}
	if err := ensurePrivateDirectory(trackDirOnDisk); err != nil {
		return fmt.Errorf("prepare track directory %s: %w", trackDirOnDisk, err)
	}

	trackManifestPath, err := artifactPathOnDisk(s.config.ArtifactRoot, path.Join(trackDirRelative, "track.json"))
	if err != nil {
		return err
	}
	return writeJSONFile(trackManifestPath, manifest)
}

func trackRelativeDir(track recordingTrackRow) (string, error) {
	return trackRelativeDirValues(track.ParticipantSeatID, track.Source, track.SourceInstanceID, track.SegmentIndex)
}

func trackRelativeDirForSummary(track manifestTrackSummaryRow) (string, error) {
	return trackRelativeDirValues(track.ParticipantSeatID, track.Source, track.SourceInstanceID, track.SegmentIndex)
}

func trackRelativeDirValues(participantSeatID string, source string, sourceInstanceID string, segmentIndex int) (string, error) {
	if err := validateArtifactPathComponent("participant_seat_id", participantSeatID); err != nil {
		return "", fmt.Errorf("build track artifact path: %w", err)
	}
	if err := validateArtifactPathComponent("source", source); err != nil {
		return "", fmt.Errorf("build track artifact path: %w", err)
	}
	if err := validateArtifactPathComponent("source_instance_id", sourceInstanceID); err != nil {
		return "", fmt.Errorf("build track artifact path: %w", err)
	}

	return path.Join(
		"seats",
		participantSeatID,
		source,
		sourceInstanceID,
		fmt.Sprintf("segment-%04d", segmentIndex),
	), nil
}

func chunkStoragePath(track recordingTrackRow, chunkIndex int) (string, error) {
	extension, err := chunkFileExtension(track.MimeType)
	if err != nil {
		return "", err
	}

	trackDirRelative, err := trackRelativeDir(track)
	if err != nil {
		return "", err
	}
	return path.Join(trackDirRelative, fmt.Sprintf("chunk-%06d%s", chunkIndex, extension)), nil
}

func writeJSONFile(path string, payload any) error {
	dir := filepath.Dir(path)
	if err := ensurePrivateDirectory(dir); err != nil {
		return fmt.Errorf("prepare directory %s: %w", dir, err)
	}

	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("encode json file %s: %w", path, err)
	}
	encoded = append(encoded, '\n')

	tempFile, err := os.CreateTemp(dir, ".tmp-*.json")
	if err != nil {
		return fmt.Errorf("create temp json file in %s: %w", dir, err)
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath)

	if _, err := tempFile.Write(encoded); err != nil {
		tempFile.Close()
		return fmt.Errorf("write temp json file %s: %w", tempPath, err)
	}
	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("close temp json file %s: %w", tempPath, err)
	}
	if err := os.Chmod(tempPath, 0o600); err != nil {
		return fmt.Errorf("chmod temp json file %s: %w", tempPath, err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("replace json file %s: %w", path, err)
	}

	return nil
}

func artifactStatusForTrack(track recordingTrackRow, chunks []trackChunkRow) string {
	return artifactStatusForTrackState(track.State, track.ExpectedChunkCount, len(chunks))
}

func artifactStatusForTrackSummary(track manifestTrackSummaryRow) string {
	return artifactStatusForTrackState(track.State, track.ExpectedChunkCount, track.ChunkCount)
}

func artifactStatusForTrackState(state string, expectedChunkCount sql.NullInt64, chunkCount int) string {
	if state == "failed" {
		return "failed"
	}
	if chunkCount == 0 {
		return "missing"
	}
	if state == "complete" && expectedChunkCount.Valid && int(expectedChunkCount.Int64) == chunkCount {
		return "complete"
	}

	return "partial"
}

func missingChunkRangesFor(track recordingTrackRow, chunks []trackChunkRow) []missingChunkRange {
	if !track.ExpectedChunkCount.Valid {
		return []missingChunkRange{}
	}

	expected := int(track.ExpectedChunkCount.Int64)
	present := make(map[int]struct{}, len(chunks))
	for _, chunk := range chunks {
		present[chunk.ChunkIndex] = struct{}{}
	}

	missing := []missingChunkRange{}
	start := -1
	for chunkIndex := 0; chunkIndex < expected; chunkIndex++ {
		_, ok := present[chunkIndex]
		if !ok && start < 0 {
			start = chunkIndex
		}
		if ok && start >= 0 {
			missing = append(missing, missingChunkRange{StartChunkIndex: start, EndChunkIndex: chunkIndex - 1})
			start = -1
		}
	}
	if start >= 0 {
		missing = append(missing, missingChunkRange{StartChunkIndex: start, EndChunkIndex: expected - 1})
	}

	return missing
}

func totalChunkBytes(chunks []trackChunkRow) int64 {
	var total int64
	for _, chunk := range chunks {
		total += chunk.ByteSize
	}

	return total
}

func nullableTextPointer(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}

	copyValue := value.String
	return &copyValue
}

func nullableInt64Pointer(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}

	copyValue := value.Int64
	return &copyValue
}

func stoppedAtForSnapshot(snapshot snapshotRow) *string {
	if snapshot.RecordingState != recordingStateStopped {
		return nil
	}

	copyValue := snapshot.UpdatedAt
	return &copyValue
}

func validateArtifactPathComponent(field string, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", field)
	}
	if value == "." || value == ".." {
		return fmt.Errorf("%s must not be . or ..", field)
	}
	if strings.ContainsAny(value, `/\\`) {
		return fmt.Errorf("%s must not contain path separators", field)
	}

	return nil
}

func artifactPathOnDisk(root string, relativePath string) (string, error) {
	cleanRoot := filepath.Clean(root)
	cleanRelativePath := filepath.Clean(filepath.FromSlash(relativePath))
	if cleanRelativePath == "." {
		return "", fmt.Errorf("artifact path %q must not be empty", relativePath)
	}
	if filepath.IsAbs(cleanRelativePath) {
		return "", fmt.Errorf("artifact path %q must be relative", relativePath)
	}

	fullPath := filepath.Join(cleanRoot, cleanRelativePath)
	relativeToRoot, err := filepath.Rel(cleanRoot, fullPath)
	if err != nil {
		return "", fmt.Errorf("resolve artifact path %q: %w", relativePath, err)
	}
	if relativeToRoot == ".." || strings.HasPrefix(relativeToRoot, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("artifact path %q escapes artifact root", relativePath)
	}

	return fullPath, nil
}
