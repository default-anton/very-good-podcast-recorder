package sessiond

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
)

const maxChunkUploadBytes int64 = 128 << 20

type startTrackRequest struct {
	RecordingTrackID       string  `json:"recording_track_id"`
	RecordingEpochID       string  `json:"recording_epoch_id"`
	Source                 string  `json:"source"`
	SourceInstanceID       string  `json:"source_instance_id"`
	CaptureGroupID         *string `json:"capture_group_id"`
	Kind                   string  `json:"kind"`
	SegmentIndex           int     `json:"segment_index"`
	MimeType               string  `json:"mime_type"`
	CaptureStartOffsetUS   int64   `json:"capture_start_offset_us"`
	ClockSyncUncertaintyUS int64   `json:"clock_sync_uncertainty_us"`
}

type recordingTrackResponse struct {
	RecordingTrackID       string  `json:"recording_track_id"`
	RecordingEpochID       string  `json:"recording_epoch_id"`
	ParticipantSeatID      string  `json:"participant_seat_id"`
	SessionID              string  `json:"session_id"`
	Source                 string  `json:"source"`
	SourceInstanceID       string  `json:"source_instance_id"`
	CaptureGroupID         *string `json:"capture_group_id"`
	Kind                   string  `json:"kind"`
	SegmentIndex           int     `json:"segment_index"`
	MimeType               string  `json:"mime_type"`
	CaptureStartOffsetUS   int64   `json:"capture_start_offset_us"`
	CaptureEndOffsetUS     *int64  `json:"capture_end_offset_us"`
	ClockSyncUncertaintyUS int64   `json:"clock_sync_uncertainty_us"`
	State                  string  `json:"state"`
}

type finishTrackRequest struct {
	ExpectedChunkCount int   `json:"expected_chunk_count"`
	CaptureEndOffsetUS int64 `json:"capture_end_offset_us"`
}

type finishTrackResponse struct {
	RecordingTrackID     string `json:"recording_track_id"`
	RecordingEpochID     string `json:"recording_epoch_id"`
	CaptureStartOffsetUS int64  `json:"capture_start_offset_us"`
	CaptureEndOffsetUS   int64  `json:"capture_end_offset_us"`
	ExpectedChunkCount   int    `json:"expected_chunk_count"`
	ReceivedChunkCount   int    `json:"received_chunk_count"`
	State                string `json:"state"`
}

type uploadChunkResponse struct {
	RecordingTrackID string `json:"recording_track_id"`
	ChunkIndex       int    `json:"chunk_index"`
	ByteSize         int64  `json:"byte_size"`
	SHA256Hex        string `json:"sha256_hex"`
	Status           string `json:"status"`
}

func (s *Server) handleStartTrack(writer http.ResponseWriter, request *http.Request) {
	var body startTrackRequest
	if err := decodeJSONBody(request, &body); err != nil {
		writeRequestError(writer, err)
		return
	}

	store, err := s.ensureStore(request.Context())
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	response, statusCode, err := store.startTrack(request.Context(), claimCookieValue(request), body)
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	writeJSON(writer, statusCode, response)
}

func (s *Server) handleUploadChunk(writer http.ResponseWriter, request *http.Request) {
	store, err := s.ensureStore(request.Context())
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	recordingTrackID := strings.TrimSpace(request.PathValue("recording_track_id"))
	chunkIndex, err := parseNonNegativeIndex(request.PathValue("chunk_index"), "chunk_index")
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	chunkBytes, err := readChunkBody(request)
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	response, statusCode, err := store.uploadChunk(
		request.Context(),
		claimCookieValue(request),
		recordingTrackID,
		chunkIndex,
		request.Header.Get("Content-Type"),
		request.ContentLength,
		request.Header.Get("X-Chunk-Sha256"),
		chunkBytes,
	)
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	writeJSON(writer, statusCode, response)
}

func (s *Server) handleFinishTrack(writer http.ResponseWriter, request *http.Request) {
	var body finishTrackRequest
	if err := decodeJSONBody(request, &body); err != nil {
		writeRequestError(writer, err)
		return
	}

	store, err := s.ensureStore(request.Context())
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	response, err := store.finishTrack(
		request.Context(),
		claimCookieValue(request),
		strings.TrimSpace(request.PathValue("recording_track_id")),
		body,
	)
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	writeJSON(writer, http.StatusOK, response)
}

func parseNonNegativeIndex(raw string, field string) (int, error) {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 0, requestBadRequest("invalid_request", fmt.Sprintf("%s must be a non-negative integer", field))
	}
	if value < 0 {
		return 0, requestBadRequest("invalid_request", fmt.Sprintf("%s must be >= 0", field))
	}

	return value, nil
}

func readChunkBody(request *http.Request) ([]byte, error) {
	if request.ContentLength < 0 {
		return nil, requestBadRequest("invalid_request", "Content-Length header is required")
	}
	if request.ContentLength > maxChunkUploadBytes {
		return nil, requestPayloadTooLarge(
			"chunk_too_large",
			fmt.Sprintf("chunk exceeds the %d byte upload limit", maxChunkUploadBytes),
		)
	}
	defer request.Body.Close()

	limited := io.LimitReader(request.Body, maxChunkUploadBytes+1)
	chunkBytes, err := io.ReadAll(limited)
	if err != nil {
		return nil, requestBadRequest("invalid_request", fmt.Sprintf("chunk body must be readable: %v", err))
	}
	if int64(len(chunkBytes)) > maxChunkUploadBytes {
		return nil, requestPayloadTooLarge(
			"chunk_too_large",
			fmt.Sprintf("chunk exceeds the %d byte upload limit", maxChunkUploadBytes),
		)
	}

	return chunkBytes, nil
}
