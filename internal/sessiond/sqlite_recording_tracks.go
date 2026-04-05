package sessiond

import (
	"context"
	"database/sql"
	"fmt"
)

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

func toNullString(value *string) sql.NullString {
	if value == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: *value, Valid: true}
}

func toNullInt64(value int64) sql.NullInt64 {
	return sql.NullInt64{Int64: value, Valid: true}
}

func nullStringValue(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}
