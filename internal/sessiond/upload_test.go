package sessiond

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"testing"
)

func TestUploadHappyPathPersistsChunksAndManifests(t *testing.T) {
	t.Parallel()

	server := newPreparedTestServer(t)
	_, hostCookie := claimSeat(t, server, testHostSeat, roleHost, testHostJoinKey, "")

	started := startRecordingForTest(t, server, hostCookie)
	if started.RecordingEpochID == nil || *started.RecordingEpochID == "" {
		t.Fatal("recording_epoch_id = nil/empty, want minted epoch id")
	}

	trackID := "trk_happy_path"
	sourceInstanceID := "src_mic_happy"
	startTrackBody := startTrackRequest{
		RecordingTrackID:       trackID,
		RecordingEpochID:       *started.RecordingEpochID,
		Source:                 "mic",
		SourceInstanceID:       sourceInstanceID,
		Kind:                   "audio",
		SegmentIndex:           0,
		MimeType:               "audio/webm",
		CaptureStartOffsetUS:   1250000,
		ClockSyncUncertaintyUS: 8000,
	}

	var startedTrack recordingTrackResponse
	statusCode, _ := callJSON(t, server, http.MethodPost, "/api/v1/recording-tracks/start", startTrackBody, hostCookie, &startedTrack)
	if statusCode != http.StatusCreated {
		t.Fatalf("/recording-tracks/start status = %d, want %d", statusCode, http.StatusCreated)
	}
	if startedTrack.State != "recording" {
		t.Fatalf("started track state = %q, want %q", startedTrack.State, "recording")
	}

	firstChunk := []byte("chunk-zero-audio")
	storedChunk := uploadChunkForTest(t, server, trackID, 0, "audio/webm", firstChunk, hostCookie)
	if storedChunk.Status != "stored" {
		t.Fatalf("first chunk status = %q, want %q", storedChunk.Status, "stored")
	}

	duplicateChunk := uploadChunkForTest(t, server, trackID, 0, "audio/webm", firstChunk, hostCookie)
	if duplicateChunk.Status != "duplicate" {
		t.Fatalf("duplicate chunk status = %q, want %q", duplicateChunk.Status, "duplicate")
	}

	var draining recordingSnapshot
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/session-recording/stop", nil, hostCookie, &draining)
	if statusCode != http.StatusOK {
		t.Fatalf("/session-recording/stop status = %d, want %d", statusCode, http.StatusOK)
	}
	if draining.RecordingState != recordingStateDraining {
		t.Fatalf("stop recording_state = %q, want %q", draining.RecordingState, recordingStateDraining)
	}

	finishBody := finishTrackRequest{ExpectedChunkCount: 2, CaptureEndOffsetUS: 27234567}
	var finishedTrack finishTrackResponse
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/recording-tracks/"+trackID+"/finish", finishBody, hostCookie, &finishedTrack)
	if statusCode != http.StatusOK {
		t.Fatalf("/recording-tracks/%s/finish status = %d, want %d", trackID, statusCode, http.StatusOK)
	}
	if finishedTrack.State != "uploading" {
		t.Fatalf("finish state = %q, want %q", finishedTrack.State, "uploading")
	}
	if finishedTrack.ReceivedChunkCount != 1 {
		t.Fatalf("finish received_chunk_count = %d, want 1", finishedTrack.ReceivedChunkCount)
	}
	if finishedTrack.RecordingEpochID != *started.RecordingEpochID {
		t.Fatalf("finish recording_epoch_id = %q, want %q", finishedTrack.RecordingEpochID, *started.RecordingEpochID)
	}

	secondChunk := []byte("chunk-one-audio")
	uploadChunkForTest(t, server, trackID, 1, "audio/webm", secondChunk, hostCookie)

	var finalSession sessionView
	statusCode, _ = callJSON(t, server, http.MethodGet, "/api/v1/session", nil, hostCookie, &finalSession)
	if statusCode != http.StatusOK {
		t.Fatalf("/session status = %d, want %d", statusCode, http.StatusOK)
	}
	if finalSession.RecordingState != recordingStateStopped {
		t.Fatalf("final recording_state = %q, want %q", finalSession.RecordingState, recordingStateStopped)
	}

	sessionManifestPath := filepath.Join(server.config.ArtifactRoot, "session.json")
	rawSessionManifest, err := os.ReadFile(sessionManifestPath)
	if err != nil {
		t.Fatalf("os.ReadFile(%q): %v", sessionManifestPath, err)
	}
	var sessionFile sessionManifest
	if err := json.Unmarshal(rawSessionManifest, &sessionFile); err != nil {
		t.Fatalf("json.Unmarshal(session.json): %v", err)
	}
	if sessionFile.RecordingState != recordingStateStopped {
		t.Fatalf("session.json recording_state = %q, want %q", sessionFile.RecordingState, recordingStateStopped)
	}
	if sessionFile.RecordingHealth != recordingHealthHealthy {
		t.Fatalf("session.json recording_health = %q, want %q", sessionFile.RecordingHealth, recordingHealthHealthy)
	}
	if sessionFile.RecordingEpochID != *started.RecordingEpochID {
		t.Fatalf("session.json recording_epoch_id = %q, want %q", sessionFile.RecordingEpochID, *started.RecordingEpochID)
	}

	hostSeat := manifestSeatByID(t, sessionFile, testHostSeat)
	if len(hostSeat.Tracks) != 1 {
		t.Fatalf("host session.json tracks = %d, want 1", len(hostSeat.Tracks))
	}
	hostTrack := hostSeat.Tracks[0]
	if hostTrack.ArtifactStatus != "complete" {
		t.Fatalf("host track artifact_status = %q, want %q", hostTrack.ArtifactStatus, "complete")
	}
	if hostTrack.ChunkCount != 2 {
		t.Fatalf("host track chunk_count = %d, want 2", hostTrack.ChunkCount)
	}
	if hostTrack.Path != "seats/seat-host-01/mic/src_mic_happy/segment-0000" {
		t.Fatalf("host track path = %q, want %q", hostTrack.Path, "seats/seat-host-01/mic/src_mic_happy/segment-0000")
	}

	trackManifestPath := filepath.Join(server.config.ArtifactRoot, filepath.FromSlash(hostTrack.Path), "track.json")
	rawTrackManifest, err := os.ReadFile(trackManifestPath)
	if err != nil {
		t.Fatalf("os.ReadFile(%q): %v", trackManifestPath, err)
	}
	var trackFile trackManifest
	if err := json.Unmarshal(rawTrackManifest, &trackFile); err != nil {
		t.Fatalf("json.Unmarshal(track.json): %v", err)
	}
	if trackFile.ArtifactStatus != "complete" {
		t.Fatalf("track.json artifact_status = %q, want %q", trackFile.ArtifactStatus, "complete")
	}
	if len(trackFile.Chunks) != 2 {
		t.Fatalf("track.json chunks = %d, want 2", len(trackFile.Chunks))
	}
	if len(trackFile.Salvage.MissingChunkRanges) != 0 {
		t.Fatalf("track.json missing_chunk_ranges = %#v, want empty", trackFile.Salvage.MissingChunkRanges)
	}

	sort.Slice(trackFile.Chunks, func(left int, right int) bool {
		return trackFile.Chunks[left].ChunkIndex < trackFile.Chunks[right].ChunkIndex
	})
	assertChunkFileContents(t, server.config.ArtifactRoot, hostTrack.Path, trackFile.Chunks[0].File, firstChunk)
	assertChunkFileContents(t, server.config.ArtifactRoot, hostTrack.Path, trackFile.Chunks[1].File, secondChunk)
}

func TestUploadEndpointsRejectConflictsAndWrongSeatOwnership(t *testing.T) {
	t.Parallel()

	server := newPreparedTestServer(t)
	_, hostCookie := claimSeat(t, server, testHostSeat, roleHost, testHostJoinKey, "")
	_, guestCookie := claimSeat(t, server, testGuestSeatA, roleGuest, testGuestJoinKey, "")

	started := startRecordingForTest(t, server, hostCookie)
	trackID := "trk_conflict_path"
	startTrackBody := startTrackRequest{
		RecordingTrackID:       trackID,
		RecordingEpochID:       *started.RecordingEpochID,
		Source:                 "mic",
		SourceInstanceID:       "src_mic_conflict",
		Kind:                   "audio",
		SegmentIndex:           0,
		MimeType:               "audio/webm",
		CaptureStartOffsetUS:   10,
		ClockSyncUncertaintyUS: 1,
	}

	var startedTrack recordingTrackResponse
	statusCode, _ := callJSON(t, server, http.MethodPost, "/api/v1/recording-tracks/start", startTrackBody, hostCookie, &startedTrack)
	if statusCode != http.StatusCreated {
		t.Fatalf("/recording-tracks/start status = %d, want %d", statusCode, http.StatusCreated)
	}

	conflictingStart := startTrackBody
	conflictingStart.CaptureStartOffsetUS = 11
	var startConflict errorEnvelope
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/recording-tracks/start", conflictingStart, hostCookie, &startConflict)
	if statusCode != http.StatusConflict {
		t.Fatalf("conflicting /recording-tracks/start status = %d, want %d", statusCode, http.StatusConflict)
	}
	if startConflict.Error.Code != "track_conflict" {
		t.Fatalf("conflicting start error code = %q, want %q", startConflict.Error.Code, "track_conflict")
	}

	chunkBody := []byte("owned-by-host")
	uploadChunkForTest(t, server, trackID, 0, "audio/webm", chunkBody, hostCookie)

	var ownershipError errorEnvelope
	statusCode = callChunkUploadJSON(t, server, trackID, 0, "audio/webm", chunkBody, guestCookie, &ownershipError)
	if statusCode != http.StatusForbidden {
		t.Fatalf("guest chunk upload status = %d, want %d", statusCode, http.StatusForbidden)
	}
	if ownershipError.Error.Code != "track_access_denied" {
		t.Fatalf("guest chunk upload error code = %q, want %q", ownershipError.Error.Code, "track_access_denied")
	}

	var chunkConflict errorEnvelope
	statusCode = callChunkUploadJSON(t, server, trackID, 0, "audio/webm", []byte("different-bytes"), hostCookie, &chunkConflict)
	if statusCode != http.StatusConflict {
		t.Fatalf("conflicting chunk upload status = %d, want %d", statusCode, http.StatusConflict)
	}
	if chunkConflict.Error.Code != "chunk_conflict" {
		t.Fatalf("conflicting chunk upload error code = %q, want %q", chunkConflict.Error.Code, "chunk_conflict")
	}

	finishBody := finishTrackRequest{ExpectedChunkCount: 1, CaptureEndOffsetUS: 20}
	var finished finishTrackResponse
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/recording-tracks/"+trackID+"/finish", finishBody, hostCookie, &finished)
	if statusCode != http.StatusOK {
		t.Fatalf("/recording-tracks/%s/finish status = %d, want %d", trackID, statusCode, http.StatusOK)
	}

	conflictingFinish := finishBody
	conflictingFinish.ExpectedChunkCount = 2
	var finishConflict errorEnvelope
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/recording-tracks/"+trackID+"/finish", conflictingFinish, hostCookie, &finishConflict)
	if statusCode != http.StatusConflict {
		t.Fatalf("conflicting finish status = %d, want %d", statusCode, http.StatusConflict)
	}
	if finishConflict.Error.Code != "finish_conflict" {
		t.Fatalf("conflicting finish error code = %q, want %q", finishConflict.Error.Code, "finish_conflict")
	}
}

func TestStartTrackRejectsUnsafeSourceInstanceID(t *testing.T) {
	t.Parallel()

	server := newPreparedTestServer(t)
	_, hostCookie := claimSeat(t, server, testHostSeat, roleHost, testHostJoinKey, "")
	started := startRecordingForTest(t, server, hostCookie)

	badStart := startTrackRequest{
		RecordingTrackID:       "trk_bad_source_instance",
		RecordingEpochID:       *started.RecordingEpochID,
		Source:                 "mic",
		SourceInstanceID:       "../../../escape",
		Kind:                   "audio",
		SegmentIndex:           0,
		MimeType:               "audio/webm",
		CaptureStartOffsetUS:   10,
		ClockSyncUncertaintyUS: 1,
	}

	var badRequest errorEnvelope
	statusCode, _ := callJSON(t, server, http.MethodPost, "/api/v1/recording-tracks/start", badStart, hostCookie, &badRequest)
	if statusCode != http.StatusBadRequest {
		t.Fatalf("unsafe /recording-tracks/start status = %d, want %d", statusCode, http.StatusBadRequest)
	}
	if badRequest.Error.Code != "invalid_request" {
		t.Fatalf("unsafe start error code = %q, want %q", badRequest.Error.Code, "invalid_request")
	}

	safeStart := badStart
	safeStart.SourceInstanceID = "src_safe_after_reject"
	var startedTrack recordingTrackResponse
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/recording-tracks/start", safeStart, hostCookie, &startedTrack)
	if statusCode != http.StatusCreated {
		t.Fatalf("safe /recording-tracks/start status = %d, want %d", statusCode, http.StatusCreated)
	}
}

func TestStartTrackReplayRemainsIdempotentAfterFinish(t *testing.T) {
	t.Parallel()

	server := newPreparedTestServer(t)
	_, hostCookie := claimSeat(t, server, testHostSeat, roleHost, testHostJoinKey, "")
	started := startRecordingForTest(t, server, hostCookie)

	startTrackBody := startTrackRequest{
		RecordingTrackID:       "trk_start_replay_after_finish",
		RecordingEpochID:       *started.RecordingEpochID,
		Source:                 "mic",
		SourceInstanceID:       "src_replay_after_finish",
		Kind:                   "audio",
		SegmentIndex:           0,
		MimeType:               "audio/webm",
		CaptureStartOffsetUS:   125,
		ClockSyncUncertaintyUS: 4,
	}

	var startedTrack recordingTrackResponse
	statusCode, _ := callJSON(t, server, http.MethodPost, "/api/v1/recording-tracks/start", startTrackBody, hostCookie, &startedTrack)
	if statusCode != http.StatusCreated {
		t.Fatalf("/recording-tracks/start status = %d, want %d", statusCode, http.StatusCreated)
	}

	finishBody := finishTrackRequest{ExpectedChunkCount: 0, CaptureEndOffsetUS: 250}
	var finishedTrack finishTrackResponse
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/recording-tracks/"+startTrackBody.RecordingTrackID+"/finish", finishBody, hostCookie, &finishedTrack)
	if statusCode != http.StatusOK {
		t.Fatalf("/recording-tracks/%s/finish status = %d, want %d", startTrackBody.RecordingTrackID, statusCode, http.StatusOK)
	}
	if finishedTrack.State != "complete" {
		t.Fatalf("finish state = %q, want %q", finishedTrack.State, "complete")
	}

	var replayedTrack recordingTrackResponse
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/recording-tracks/start", startTrackBody, hostCookie, &replayedTrack)
	if statusCode != http.StatusOK {
		t.Fatalf("replayed /recording-tracks/start status = %d, want %d", statusCode, http.StatusOK)
	}
	if replayedTrack.State != "complete" {
		t.Fatalf("replayed track state = %q, want %q", replayedTrack.State, "complete")
	}
	if replayedTrack.CaptureEndOffsetUS == nil || *replayedTrack.CaptureEndOffsetUS != finishBody.CaptureEndOffsetUS {
		t.Fatalf("replayed capture_end_offset_us = %v, want %d", replayedTrack.CaptureEndOffsetUS, finishBody.CaptureEndOffsetUS)
	}
}

func TestStopRecordingStopsImmediatelyWhenTracksAreAlreadyTerminal(t *testing.T) {
	t.Parallel()

	server := newPreparedTestServer(t)
	_, hostCookie := claimSeat(t, server, testHostSeat, roleHost, testHostJoinKey, "")
	started := startRecordingForTest(t, server, hostCookie)

	trackID := "trk_terminal_before_stop"
	startTrackBody := startTrackRequest{
		RecordingTrackID:       trackID,
		RecordingEpochID:       *started.RecordingEpochID,
		Source:                 "mic",
		SourceInstanceID:       "src_terminal_before_stop",
		Kind:                   "audio",
		SegmentIndex:           0,
		MimeType:               "audio/webm",
		CaptureStartOffsetUS:   100,
		ClockSyncUncertaintyUS: 10,
	}

	var startedTrack recordingTrackResponse
	statusCode, _ := callJSON(t, server, http.MethodPost, "/api/v1/recording-tracks/start", startTrackBody, hostCookie, &startedTrack)
	if statusCode != http.StatusCreated {
		t.Fatalf("/recording-tracks/start status = %d, want %d", statusCode, http.StatusCreated)
	}

	uploadChunkForTest(t, server, trackID, 0, "audio/webm", []byte("terminal-before-stop"), hostCookie)

	finishBody := finishTrackRequest{ExpectedChunkCount: 1, CaptureEndOffsetUS: 200}
	var finishedTrack finishTrackResponse
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/recording-tracks/"+trackID+"/finish", finishBody, hostCookie, &finishedTrack)
	if statusCode != http.StatusOK {
		t.Fatalf("/recording-tracks/%s/finish status = %d, want %d", trackID, statusCode, http.StatusOK)
	}
	if finishedTrack.State != "complete" {
		t.Fatalf("finish state = %q, want %q", finishedTrack.State, "complete")
	}

	var stopped recordingSnapshot
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/session-recording/stop", nil, hostCookie, &stopped)
	if statusCode != http.StatusOK {
		t.Fatalf("/session-recording/stop status = %d, want %d", statusCode, http.StatusOK)
	}
	if stopped.RecordingState != recordingStateStopped {
		t.Fatalf("stop recording_state = %q, want %q", stopped.RecordingState, recordingStateStopped)
	}
}

func startRecordingForTest(t *testing.T, server *Server, hostCookie string) recordingSnapshot {
	t.Helper()

	var response recordingSnapshot
	statusCode, _ := callJSON(t, server, http.MethodPost, "/api/v1/session-recording/start", nil, hostCookie, &response)
	if statusCode != http.StatusCreated {
		t.Fatalf("/session-recording/start status = %d, want %d", statusCode, http.StatusCreated)
	}
	return response
}

func uploadChunkForTest(t *testing.T, server *Server, recordingTrackID string, chunkIndex int, contentType string, body []byte, cookie string) uploadChunkResponse {
	t.Helper()

	var response uploadChunkResponse
	statusCode := callChunkUploadJSON(t, server, recordingTrackID, chunkIndex, contentType, body, cookie, &response)
	if statusCode != http.StatusCreated && statusCode != http.StatusOK {
		t.Fatalf("chunk upload status = %d, want %d or %d", statusCode, http.StatusCreated, http.StatusOK)
	}
	return response
}

func callChunkUploadJSON(t *testing.T, server *Server, recordingTrackID string, chunkIndex int, contentType string, body []byte, cookie string, dst any) int {
	t.Helper()

	request := httptest.NewRequest(
		http.MethodPut,
		"/api/v1/recording-tracks/"+recordingTrackID+"/chunks/"+strconv.Itoa(chunkIndex),
		bytes.NewReader(body),
	)
	request.Header.Set("Content-Type", contentType)
	request.Header.Set("X-Chunk-Sha256", sha256Hex(body))
	if cookie != "" {
		request.AddCookie(&http.Cookie{Name: claimCookieName, Value: cookie})
	}

	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)
	if dst != nil && recorder.Body.Len() > 0 {
		if err := json.Unmarshal(recorder.Body.Bytes(), dst); err != nil {
			t.Fatalf("json.Unmarshal(chunk upload): %v\nbody=%s", err, recorder.Body.String())
		}
	}
	return recorder.Code
}

func manifestSeatByID(t *testing.T, manifest sessionManifest, seatID string) sessionManifestSeat {
	t.Helper()

	for _, seat := range manifest.Seats {
		if seat.ParticipantSeatID == seatID {
			return seat
		}
	}
	t.Fatalf("session.json missing seat %s", seatID)
	return sessionManifestSeat{}
}

func assertChunkFileContents(t *testing.T, artifactRoot string, trackPath string, file string, want []byte) {
	t.Helper()

	chunkPath := filepath.Join(artifactRoot, filepath.FromSlash(trackPath), file)
	got, err := os.ReadFile(chunkPath)
	if err != nil {
		t.Fatalf("os.ReadFile(%q): %v", chunkPath, err)
	}
	if string(got) != string(want) {
		t.Fatalf("chunk file %s contents = %q, want %q", chunkPath, got, want)
	}
}

func sha256Hex(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}
