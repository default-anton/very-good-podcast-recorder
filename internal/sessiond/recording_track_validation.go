package sessiond

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"mime"
	"strings"
)

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
