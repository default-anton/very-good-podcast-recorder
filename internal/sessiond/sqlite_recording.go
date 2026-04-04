package sessiond

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

func (s *store) loadRecordingClockAnchor(ctx context.Context) error {
	snapshot, err := s.loadSnapshot(ctx)
	if err != nil {
		return err
	}
	if !snapshot.RecordingEpochID.Valid || !snapshot.RecordingEpochStartedAt.Valid {
		return nil
	}

	recordingEpochZero, err := parseStoredTimestamp(snapshot.RecordingEpochStartedAt.String)
	if err != nil {
		return fmt.Errorf("parse stored recording epoch start %q: %w", snapshot.RecordingEpochStartedAt.String, err)
	}

	s.recordingEpochID = snapshot.RecordingEpochID.String
	s.recordingEpochZero = recordingEpochZero

	return nil
}

func (s *store) sessionSnapshot(ctx context.Context, rawCookie string) (sessionView, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	claim, err := s.requireActiveClaim(ctx, rawCookie)
	if err != nil {
		return sessionView{}, err
	}
	snapshot, err := s.loadSnapshot(ctx)
	if err != nil {
		return sessionView{}, err
	}

	return sessionView{
		SessionID:               snapshot.SessionID,
		ParticipantSeatID:       claim.ParticipantSeatID,
		Role:                    claim.Role,
		RecordingState:          snapshot.RecordingState,
		RecordingHealth:         snapshot.RecordingHealth,
		RecordingEpochID:        nullableString(snapshot.RecordingEpochID),
		RecordingEpochStartedAt: nullableString(snapshot.RecordingEpochStartedAt),
	}, nil
}

func (s *store) startRecording(ctx context.Context, rawCookie string) (recordingSnapshot, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	claim, err := s.requireActiveClaim(ctx, rawCookie)
	if err != nil {
		return recordingSnapshot{}, 0, err
	}
	if claim.Role != roleHost {
		return recordingSnapshot{}, 0, requestForbidden(
			"host_claim_required",
			fmt.Sprintf("seat %s is a %s seat; only a host claim may start recording", claim.ParticipantSeatID, claim.Role),
		)
	}

	snapshot, err := s.loadSnapshot(ctx)
	if err != nil {
		return recordingSnapshot{}, 0, err
	}

	switch snapshot.RecordingState {
	case recordingStateWaiting:
		recordingEpochID, err := randomID("re")
		if err != nil {
			return recordingSnapshot{}, 0, fmt.Errorf("mint recording epoch id: %w", err)
		}
		recordingEpochZero := time.Now()
		recordingEpochStartedAt := recordingEpochZero.UTC().Format(time.RFC3339Nano)
		updatedAt := timestampNow()
		if _, err := s.db.ExecContext(
			ctx,
			`update session_snapshot
			 set recording_state = ?,
			     recording_health = ?,
			     recording_epoch_id = ?,
			     recording_epoch_started_at = ?,
			     updated_at = ?
			 where session_id = ?`,
			recordingStateRecording,
			recordingHealthHealthy,
			recordingEpochID,
			recordingEpochStartedAt,
			updatedAt,
			s.config.SessionID,
		); err != nil {
			return recordingSnapshot{}, 0, fmt.Errorf("transition session snapshot to recording: %w", err)
		}
		s.recordingEpochID = recordingEpochID
		s.recordingEpochZero = recordingEpochZero
		if err := s.syncSessionArtifacts(ctx); err != nil {
			return recordingSnapshot{}, 0, err
		}
		return recordingSnapshot{
			SessionID:               s.config.SessionID,
			RecordingState:          recordingStateRecording,
			RecordingHealth:         recordingHealthHealthy,
			RecordingEpochID:        &recordingEpochID,
			RecordingEpochStartedAt: &recordingEpochStartedAt,
		}, http.StatusCreated, nil
	case recordingStateRecording:
		return snapshot.asRecordingSnapshot(), http.StatusOK, nil
	case recordingStateDraining, recordingStateStopped, recordingStateFailed:
		return recordingSnapshot{}, 0, requestConflict(
			"recording_already_finished",
			fmt.Sprintf("session %s already left waiting; v1 does not support a second recording run", s.config.SessionID),
		)
	default:
		return recordingSnapshot{}, 0, fmt.Errorf("unsupported recording state %q", snapshot.RecordingState)
	}
}

func (s *store) stopRecording(ctx context.Context, rawCookie string) (recordingSnapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	claim, err := s.requireActiveClaim(ctx, rawCookie)
	if err != nil {
		return recordingSnapshot{}, err
	}
	if claim.Role != roleHost {
		return recordingSnapshot{}, requestForbidden(
			"host_claim_required",
			fmt.Sprintf("seat %s is a %s seat; only a host claim may stop recording", claim.ParticipantSeatID, claim.Role),
		)
	}

	snapshot, err := s.loadSnapshot(ctx)
	if err != nil {
		return recordingSnapshot{}, err
	}

	switch snapshot.RecordingState {
	case recordingStateRecording:
		updatedAt := timestampNow()
		if _, err := s.db.ExecContext(
			ctx,
			`update session_snapshot
			 set recording_state = ?,
			     updated_at = ?
			 where session_id = ?`,
			recordingStateDraining,
			updatedAt,
			s.config.SessionID,
		); err != nil {
			return recordingSnapshot{}, fmt.Errorf("transition session snapshot to draining: %w", err)
		}
		snapshot.RecordingState = recordingStateDraining
		if err := s.maybeAdvanceSessionToStopped(ctx); err != nil {
			return recordingSnapshot{}, err
		}
		snapshot, err = s.loadSnapshot(ctx)
		if err != nil {
			return recordingSnapshot{}, err
		}
		if err := s.syncSessionArtifacts(ctx); err != nil {
			return recordingSnapshot{}, err
		}
		return snapshot.asRecordingSnapshot(), nil
	case recordingStateDraining, recordingStateStopped:
		if snapshot.RecordingState == recordingStateDraining {
			if err := s.maybeAdvanceSessionToStopped(ctx); err != nil {
				return recordingSnapshot{}, err
			}
			snapshot, err = s.loadSnapshot(ctx)
			if err != nil {
				return recordingSnapshot{}, err
			}
		}
		if err := s.syncSessionArtifacts(ctx); err != nil {
			return recordingSnapshot{}, err
		}
		return snapshot.asRecordingSnapshot(), nil
	case recordingStateWaiting:
		return recordingSnapshot{}, requestConflict(
			"recording_not_started",
			fmt.Sprintf("session %s has not started recording yet", s.config.SessionID),
		)
	case recordingStateFailed:
		return recordingSnapshot{}, requestConflict(
			"recording_failed",
			fmt.Sprintf("session %s is already in terminal recording failure state", s.config.SessionID),
		)
	default:
		return recordingSnapshot{}, fmt.Errorf("unsupported recording state %q", snapshot.RecordingState)
	}
}

func (s *store) clockSync(ctx context.Context, rawCookie string, requestStartedAt time.Time) (clockSyncResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := s.requireActiveClaim(ctx, rawCookie); err != nil {
		return clockSyncResult{}, err
	}
	snapshot, err := s.loadSnapshot(ctx)
	if err != nil {
		return clockSyncResult{}, err
	}
	if !snapshot.RecordingEpochID.Valid || !snapshot.RecordingEpochStartedAt.Valid {
		return clockSyncResult{}, requestConflict(
			"recording_not_started",
			fmt.Sprintf("session %s has not started recording yet", s.config.SessionID),
		)
	}
	if snapshot.RecordingState != recordingStateRecording && snapshot.RecordingState != recordingStateDraining {
		return clockSyncResult{}, requestConflict(
			"recording_clock_sync_unavailable",
			fmt.Sprintf("session %s is in recording state %s; clock sync only stays available while recording or draining", s.config.SessionID, snapshot.RecordingState),
		)
	}

	recordingEpochZero, err := s.recordingEpochAnchor(snapshot)
	if err != nil {
		return clockSyncResult{}, err
	}

	return clockSyncResult{
		RecordingEpochID:        snapshot.RecordingEpochID.String,
		RecordingState:          snapshot.RecordingState,
		RecordingHealth:         snapshot.RecordingHealth,
		RecordingEpochStartedAt: snapshot.RecordingEpochStartedAt.String,
		RecordingEpochElapsedUS: time.Since(recordingEpochZero).Microseconds(),
		ServerProcessingTimeUS:  time.Since(requestStartedAt).Microseconds(),
	}, nil
}

func (s *store) recordingEpochAnchor(snapshot snapshotRow) (time.Time, error) {
	if s.recordingEpochID == snapshot.RecordingEpochID.String && !s.recordingEpochZero.IsZero() {
		return s.recordingEpochZero, nil
	}

	recordingEpochZero, err := parseStoredTimestamp(snapshot.RecordingEpochStartedAt.String)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse recording epoch start %q: %w", snapshot.RecordingEpochStartedAt.String, err)
	}
	s.recordingEpochID = snapshot.RecordingEpochID.String
	s.recordingEpochZero = recordingEpochZero

	return recordingEpochZero, nil
}

func (snapshot snapshotRow) asRecordingSnapshot() recordingSnapshot {
	return recordingSnapshot{
		SessionID:               snapshot.SessionID,
		RecordingState:          snapshot.RecordingState,
		RecordingHealth:         snapshot.RecordingHealth,
		RecordingEpochID:        nullableString(snapshot.RecordingEpochID),
		RecordingEpochStartedAt: nullableString(snapshot.RecordingEpochStartedAt),
	}
}
