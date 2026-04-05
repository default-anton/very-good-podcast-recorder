package sessiond

import "database/sql"

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
