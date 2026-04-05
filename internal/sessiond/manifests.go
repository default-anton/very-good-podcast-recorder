package sessiond

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path"
	"sort"
)

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
	if _, err := s.writeSessionManifest(ctx, snapshot); err != nil {
		return err
	}
	if err := s.pruneStaleArtifactFiles(tracks, chunksByTrack); err != nil {
		return err
	}

	return nil
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

	_, err = s.writeSessionManifest(ctx, snapshot)
	return err
}

func (s *store) syncSessionArtifacts(ctx context.Context) error {
	snapshot, err := s.loadSnapshot(ctx)
	if err != nil {
		return err
	}

	_, err = s.writeSessionManifest(ctx, snapshot)
	return err
}

func (s *store) writeSessionManifest(ctx context.Context, snapshot snapshotRow) (bool, error) {
	trackSummaries, err := s.loadManifestTrackSummaries(ctx)
	if err != nil {
		return false, err
	}
	if !snapshot.RecordingEpochID.Valid && len(trackSummaries) == 0 {
		if err := s.removeSessionManifest(); err != nil {
			return false, err
		}
		return false, nil
	}

	seats, err := s.loadManifestSeats(ctx)
	if err != nil {
		return false, err
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
			return false, err
		}

		index, ok := seatIndex[track.ParticipantSeatID]
		if !ok {
			return false, fmt.Errorf("manifest seat %s for track %s is missing", track.ParticipantSeatID, track.RecordingTrackID)
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
		return false, err
	}
	if err := writeJSONFile(sessionManifestPath, session); err != nil {
		return false, err
	}
	return true, nil
}

func (s *store) removeSessionManifest() error {
	sessionManifestPath, err := artifactPathOnDisk(s.config.ArtifactRoot, "session.json")
	if err != nil {
		return err
	}
	if err := os.Remove(sessionManifestPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove stale session manifest %s: %w", sessionManifestPath, err)
	}
	return nil
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
