package sessiond

import (
	"net/http"
	"testing"
)

func TestRecordingEndpointsRequireHostClaimAndKeepOneEpoch(t *testing.T) {
	t.Parallel()

	server := newPreparedTestServer(t)
	hostClaim, hostCookie := claimSeat(t, server, testHostSeat, roleHost, testHostJoinKey, "")
	guestClaim, guestCookie := claimSeat(t, server, testGuestSeatB, roleGuest, testGuestJoinKey, "")
	if hostClaim.LiveKit.ParticipantIdentity != testHostSeat {
		t.Fatalf("host claim participant identity = %q, want %q", hostClaim.LiveKit.ParticipantIdentity, testHostSeat)
	}
	if guestClaim.LiveKit.ParticipantIdentity != testGuestSeatB {
		t.Fatalf("guest claim participant identity = %q, want %q", guestClaim.LiveKit.ParticipantIdentity, testGuestSeatB)
	}

	var guestStartError errorEnvelope
	statusCode, _ := callJSON(t, server, http.MethodPost, "/api/v1/session-recording/start", nil, guestCookie, &guestStartError)
	if statusCode != http.StatusForbidden {
		t.Fatalf("guest /session-recording/start status = %d, want %d", statusCode, http.StatusForbidden)
	}
	if guestStartError.Error.Code != "host_claim_required" {
		t.Fatalf("guest /session-recording/start error code = %q, want %q", guestStartError.Error.Code, "host_claim_required")
	}

	var beforeStart sessionView
	statusCode, _ = callJSON(t, server, http.MethodGet, "/api/v1/session", nil, hostCookie, &beforeStart)
	if statusCode != http.StatusOK {
		t.Fatalf("pre-start /session status = %d, want %d", statusCode, http.StatusOK)
	}
	if beforeStart.RecordingState != recordingStateWaiting {
		t.Fatalf("pre-start recording_state = %q, want %q", beforeStart.RecordingState, recordingStateWaiting)
	}
	if beforeStart.RecordingEpochID != nil {
		t.Fatalf("pre-start recording_epoch_id = %v, want nil", *beforeStart.RecordingEpochID)
	}

	var started recordingSnapshot
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/session-recording/start", nil, hostCookie, &started)
	if statusCode != http.StatusCreated {
		t.Fatalf("first /session-recording/start status = %d, want %d", statusCode, http.StatusCreated)
	}
	if started.RecordingState != recordingStateRecording {
		t.Fatalf("started recording_state = %q, want %q", started.RecordingState, recordingStateRecording)
	}
	if started.RecordingEpochID == nil || *started.RecordingEpochID == "" {
		t.Fatal("started recording_epoch_id = nil/empty, want minted epoch id")
	}
	if started.RecordingEpochStartedAt == nil || *started.RecordingEpochStartedAt == "" {
		t.Fatal("started recording_epoch_started_at = nil/empty, want timestamp")
	}

	var startedAgain recordingSnapshot
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/session-recording/start", nil, hostCookie, &startedAgain)
	if statusCode != http.StatusOK {
		t.Fatalf("idempotent /session-recording/start status = %d, want %d", statusCode, http.StatusOK)
	}
	if *startedAgain.RecordingEpochID != *started.RecordingEpochID {
		t.Fatalf("idempotent start epoch id = %q, want %q", *startedAgain.RecordingEpochID, *started.RecordingEpochID)
	}

	var clockSync clockSyncResult
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/session-recording/clock-sync", nil, hostCookie, &clockSync)
	if statusCode != http.StatusOK {
		t.Fatalf("/session-recording/clock-sync status = %d, want %d", statusCode, http.StatusOK)
	}
	if clockSync.RecordingEpochID != *started.RecordingEpochID {
		t.Fatalf("clock sync epoch id = %q, want %q", clockSync.RecordingEpochID, *started.RecordingEpochID)
	}
	if clockSync.RecordingState != recordingStateRecording {
		t.Fatalf("clock sync recording_state = %q, want %q", clockSync.RecordingState, recordingStateRecording)
	}
	if clockSync.RecordingEpochElapsedUS < 0 {
		t.Fatalf("clock sync recording_epoch_elapsed_us = %d, want >= 0", clockSync.RecordingEpochElapsedUS)
	}

	var stopped recordingSnapshot
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/session-recording/stop", nil, hostCookie, &stopped)
	if statusCode != http.StatusOK {
		t.Fatalf("first /session-recording/stop status = %d, want %d", statusCode, http.StatusOK)
	}
	if stopped.RecordingState != recordingStateDraining {
		t.Fatalf("stopped recording_state = %q, want %q", stopped.RecordingState, recordingStateDraining)
	}
	if *stopped.RecordingEpochID != *started.RecordingEpochID {
		t.Fatalf("stop epoch id = %q, want %q", *stopped.RecordingEpochID, *started.RecordingEpochID)
	}

	var stoppedAgain recordingSnapshot
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/session-recording/stop", nil, hostCookie, &stoppedAgain)
	if statusCode != http.StatusOK {
		t.Fatalf("idempotent /session-recording/stop status = %d, want %d", statusCode, http.StatusOK)
	}
	if stoppedAgain.RecordingState != recordingStateDraining {
		t.Fatalf("idempotent stop recording_state = %q, want %q", stoppedAgain.RecordingState, recordingStateDraining)
	}

	var afterStop sessionView
	statusCode, _ = callJSON(t, server, http.MethodGet, "/api/v1/session", nil, hostCookie, &afterStop)
	if statusCode != http.StatusOK {
		t.Fatalf("post-stop /session status = %d, want %d", statusCode, http.StatusOK)
	}
	if afterStop.RecordingState != recordingStateDraining {
		t.Fatalf("post-stop recording_state = %q, want %q", afterStop.RecordingState, recordingStateDraining)
	}
	if *afterStop.RecordingEpochID != *started.RecordingEpochID {
		t.Fatalf("post-stop epoch id = %q, want %q", *afterStop.RecordingEpochID, *started.RecordingEpochID)
	}
}
