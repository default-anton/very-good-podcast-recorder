package sessiond

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

type errorEnvelope struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func TestSeatClaimLifecycleRejectsStaleCookies(t *testing.T) {
	t.Parallel()

	server := newPreparedTestServer(t)

	var initialPicker pickerResult
	statusCode, _ := callJSON(t, server, http.MethodPost, "/api/v1/join/seat-picker", seatPickerRequest{
		SessionID: testSessionID,
		Role:      roleGuest,
		JoinKey:   testGuestJoinKey,
	}, "", &initialPicker)
	if statusCode != http.StatusOK {
		t.Fatalf("initial /join/seat-picker status = %d, want %d", statusCode, http.StatusOK)
	}
	assertPickerState(t, initialPicker, testGuestSeatA, "available")
	assertPickerState(t, initialPicker, testGuestSeatB, "available")
	if initialPicker.OwnedSeatID != nil {
		t.Fatalf("initial owned_seat_id = %v, want nil", *initialPicker.OwnedSeatID)
	}

	guestClaim, guestCookie := claimSeat(t, server, testGuestSeatA, roleGuest, testGuestJoinKey, "")
	if guestClaim.ClaimVersion != 1 {
		t.Fatalf("guest claim version = %d, want 1", guestClaim.ClaimVersion)
	}
	if guestClaim.LiveKit.Token == "" {
		t.Fatal("guest claim livekit token = empty, want non-empty token")
	}

	var ownedPicker pickerResult
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/join/seat-picker", seatPickerRequest{
		SessionID: testSessionID,
		Role:      roleGuest,
		JoinKey:   testGuestJoinKey,
	}, guestCookie, &ownedPicker)
	if statusCode != http.StatusOK {
		t.Fatalf("owned /join/seat-picker status = %d, want %d", statusCode, http.StatusOK)
	}
	if ownedPicker.OwnedSeatID == nil || *ownedPicker.OwnedSeatID != testGuestSeatA {
		t.Fatalf("owned_seat_id = %v, want %q", ownedPicker.OwnedSeatID, testGuestSeatA)
	}
	assertPickerState(t, ownedPicker, testGuestSeatA, "you")

	markSeatDisconnected(t, server, testGuestSeatA)

	var recoveryPicker pickerResult
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/join/seat-picker", seatPickerRequest{
		SessionID: testSessionID,
		Role:      roleGuest,
		JoinKey:   testGuestJoinKey,
	}, "", &recoveryPicker)
	if statusCode != http.StatusOK {
		t.Fatalf("recovery /join/seat-picker status = %d, want %d", statusCode, http.StatusOK)
	}
	assertPickerState(t, recoveryPicker, testGuestSeatA, "rejoin_available")

	recoveredClaim, recoveredCookie := claimSeat(t, server, testGuestSeatA, roleGuest, testGuestJoinKey, "")
	if recoveredClaim.ClaimVersion != 2 {
		t.Fatalf("recovered claim version = %d, want 2", recoveredClaim.ClaimVersion)
	}
	if recoveredCookie == guestCookie {
		t.Fatal("recovered claim cookie did not rotate after disconnected-seat recovery")
	}

	var staleError errorEnvelope
	statusCode, _ = callJSON(t, server, http.MethodGet, "/api/v1/session", nil, guestCookie, &staleError)
	if statusCode != http.StatusUnauthorized {
		t.Fatalf("stale /session status = %d, want %d", statusCode, http.StatusUnauthorized)
	}
	if staleError.Error.Code != "invalid_claim" {
		t.Fatalf("stale /session error code = %q, want %q", staleError.Error.Code, "invalid_claim")
	}

	var reclaim claimResult
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/seat-claims/reclaim", reclaimSeatRequest{
		SessionID: testSessionID,
		Role:      roleGuest,
		JoinKey:   testGuestJoinKey,
	}, recoveredCookie, &reclaim)
	if statusCode != http.StatusOK {
		t.Fatalf("/seat-claims/reclaim status = %d, want %d", statusCode, http.StatusOK)
	}
	if reclaim.ClaimVersion != recoveredClaim.ClaimVersion {
		t.Fatalf("reclaim claim version = %d, want %d", reclaim.ClaimVersion, recoveredClaim.ClaimVersion)
	}
}

func TestClaimSeatFailureDoesNotPersistSeatOwnership(t *testing.T) {
	t.Parallel()

	server := newPreparedTestServer(t)
	store, err := server.ensureStore(context.Background())
	if err != nil {
		t.Fatalf("server.ensureStore(): %v", err)
	}
	store.config.LiveKit.APISecret = ""

	var claimError errorEnvelope
	statusCode, _ := callJSON(t, server, http.MethodPost, "/api/v1/seat-claims/claim", claimSeatRequest{
		SessionID:         testSessionID,
		Role:              roleGuest,
		JoinKey:           testGuestJoinKey,
		ParticipantSeatID: testGuestSeatA,
	}, "", &claimError)
	if statusCode != http.StatusInternalServerError {
		t.Fatalf("failed /seat-claims/claim status = %d, want %d", statusCode, http.StatusInternalServerError)
	}
	if claimError.Error.Code != "internal_error" {
		t.Fatalf("failed /seat-claims/claim error code = %q, want %q", claimError.Error.Code, "internal_error")
	}

	store.config.LiveKit.APISecret = "test-livekit-secret"
	claimed, _ := claimSeat(t, server, testGuestSeatA, roleGuest, testGuestJoinKey, "")
	if claimed.ClaimVersion != 1 {
		t.Fatalf("claim version after failed token mint = %d, want %d", claimed.ClaimVersion, 1)
	}
}

func TestReclaimFailureDoesNotReactivateSeat(t *testing.T) {
	t.Parallel()

	server := newPreparedTestServer(t)
	_, cookie := claimSeat(t, server, testGuestSeatA, roleGuest, testGuestJoinKey, "")
	markSeatDisconnected(t, server, testGuestSeatA)
	store, err := server.ensureStore(context.Background())
	if err != nil {
		t.Fatalf("server.ensureStore(): %v", err)
	}
	store.config.LiveKit.APISecret = ""

	var reclaimError errorEnvelope
	statusCode, _ := callJSON(t, server, http.MethodPost, "/api/v1/seat-claims/reclaim", reclaimSeatRequest{
		SessionID: testSessionID,
		Role:      roleGuest,
		JoinKey:   testGuestJoinKey,
	}, cookie, &reclaimError)
	if statusCode != http.StatusInternalServerError {
		t.Fatalf("failed /seat-claims/reclaim status = %d, want %d", statusCode, http.StatusInternalServerError)
	}
	if reclaimError.Error.Code != "internal_error" {
		t.Fatalf("failed /seat-claims/reclaim error code = %q, want %q", reclaimError.Error.Code, "internal_error")
	}

	var recoveryPicker pickerResult
	statusCode, _ = callJSON(t, server, http.MethodPost, "/api/v1/join/seat-picker", seatPickerRequest{
		SessionID: testSessionID,
		Role:      roleGuest,
		JoinKey:   testGuestJoinKey,
	}, "", &recoveryPicker)
	if statusCode != http.StatusOK {
		t.Fatalf("/join/seat-picker status after failed reclaim = %d, want %d", statusCode, http.StatusOK)
	}
	assertPickerState(t, recoveryPicker, testGuestSeatA, "rejoin_available")

	store.config.LiveKit.APISecret = "test-livekit-secret"
	reclaimed, _ := claimSeat(t, server, testGuestSeatA, roleGuest, testGuestJoinKey, "")
	if reclaimed.ClaimVersion != 2 {
		t.Fatalf("claim version after failed reclaim = %d, want %d", reclaimed.ClaimVersion, 2)
	}
}

const (
	testSessionID    = "sess-sessiond-claims"
	testHostJoinKey  = "host-secret-01"
	testGuestJoinKey = "guest-secret-01"
	testHostSeat     = "seat-host-01"
	testGuestSeatA   = "seat-guest-a"
	testGuestSeatB   = "seat-guest-b"
)

func newPreparedTestServer(t *testing.T) *Server {
	t.Helper()

	tempDir := t.TempDir()
	cfg := newTestConfig(tempDir, testSessionID)

	if err := PrepareRuntime(cfg); err != nil {
		t.Fatalf("PrepareRuntime(): %v", err)
	}

	server, err := NewServer(cfg)
	if err != nil {
		t.Fatalf("NewServer(): %v", err)
	}
	if err := server.Initialize(context.Background()); err != nil {
		t.Fatalf("server.Initialize(): %v", err)
	}
	t.Cleanup(func() {
		if err := server.Close(); err != nil {
			t.Fatalf("server.Close(): %v", err)
		}
	})

	return server
}

func newTestConfig(tempDir string, sessionID string) Config {
	return Config{
		ListenAddr:     "127.0.0.1:8081",
		SessionID:      sessionID,
		ReleaseVersion: "test",
		ArtifactRoot:   filepath.Join(tempDir, "artifacts"),
		SQLitePath:     filepath.Join(tempDir, "state", "sessiond.sqlite"),
		LiveKit: LiveKitConfig{
			APIKey:    "test-livekit-key",
			APISecret: "test-livekit-secret",
		},
		Bootstrap: BootstrapConfig{
			HostJoinKey:  testHostJoinKey,
			GuestJoinKey: testGuestJoinKey,
			Seats: []BootstrapSeat{
				{ID: testHostSeat, Role: roleHost, DisplayName: "Host"},
				{ID: testGuestSeatA, Role: roleGuest, DisplayName: "Guest A"},
				{ID: testGuestSeatB, Role: roleGuest, DisplayName: "Guest B"},
			},
		},
	}
}

func claimSeat(t *testing.T, server *Server, seatID string, role string, joinKey string, cookie string) (claimResult, string) {
	t.Helper()

	var response claimResult
	statusCode, setCookie := callJSON(t, server, http.MethodPost, "/api/v1/seat-claims/claim", claimSeatRequest{
		SessionID:         testSessionID,
		Role:              role,
		JoinKey:           joinKey,
		ParticipantSeatID: seatID,
	}, cookie, &response)
	if statusCode != http.StatusCreated && statusCode != http.StatusOK {
		t.Fatalf("/seat-claims/claim status = %d, want %d or %d", statusCode, http.StatusCreated, http.StatusOK)
	}
	if response.ParticipantSeatID != seatID {
		t.Fatalf("claim participant_seat_id = %q, want %q", response.ParticipantSeatID, seatID)
	}
	if setCookie == "" {
		t.Fatal("claim did not set a claim cookie")
	}

	return response, setCookie
}

func callJSON(t *testing.T, server *Server, method string, path string, body any, cookie string, dst any) (int, string) {
	t.Helper()

	var requestBody []byte
	if body != nil {
		encodedBody, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("json.Marshal(%s): %v", path, err)
		}
		requestBody = encodedBody
	}

	request := httptest.NewRequest(method, path, bytes.NewReader(requestBody))
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if cookie != "" {
		request.AddCookie(&http.Cookie{Name: claimCookieName, Value: cookie})
	}

	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)

	if dst != nil && recorder.Body.Len() > 0 {
		if err := json.Unmarshal(recorder.Body.Bytes(), dst); err != nil {
			t.Fatalf("json.Unmarshal(%s): %v\nbody=%s", path, err, recorder.Body.String())
		}
	}

	cookies := recorder.Result().Cookies()
	if len(cookies) == 0 {
		return recorder.Code, ""
	}

	return recorder.Code, cookies[0].Value
}

func assertPickerState(t *testing.T, picker pickerResult, seatID string, want string) {
	t.Helper()

	for _, seat := range picker.Seats {
		if seat.ParticipantSeatID == seatID {
			if seat.PickerState != want {
				t.Fatalf("picker state for %s = %q, want %q", seatID, seat.PickerState, want)
			}
			return
		}
	}

	t.Fatalf("picker did not include seat %s", seatID)
}

func markSeatDisconnected(t *testing.T, server *Server, seatID string) {
	t.Helper()

	store, err := server.ensureStore(context.Background())
	if err != nil {
		t.Fatalf("server.ensureStore(): %v", err)
	}
	if _, err := store.db.Exec(
		`update seat_claims set state = ?, current_connection_id = null, updated_at = ?, last_seen_at = ? where participant_seat_id = ?`,
		claimStateDisconnected,
		timestampNow(),
		timestampNow(),
		seatID,
	); err != nil {
		t.Fatalf("mark seat disconnected: %v", err)
	}
}
