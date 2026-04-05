package sessiond

import (
	"context"
	"fmt"
)

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

func currentTrackState(track recordingTrackRow, receivedChunkCount int) string {
	if track.ExpectedChunkCount.Valid && receivedChunkCount == int(track.ExpectedChunkCount.Int64) {
		return "complete"
	}
	if track.ExpectedChunkCount.Valid {
		return "uploading"
	}
	return track.State
}
