package sessiond

import (
	"context"
	"database/sql"
	"fmt"
)

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
