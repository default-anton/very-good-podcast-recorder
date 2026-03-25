package logging

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"testing"
)

func TestNewLoggerEmitsStructuredFields(t *testing.T) {
	var buffer bytes.Buffer
	logger := NewLogger(&buffer, "controlplane", KindService, slog.LevelInfo)
	logger.Info("started", SessionID("session-1"), Role("host"))

	var payload map[string]any
	if err := json.Unmarshal(buffer.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal log payload: %v", err)
	}

	if got, want := payload["component"], "controlplane"; got != want {
		t.Fatalf("component = %v, want %v", got, want)
	}
	if got, want := payload["log_kind"], "service"; got != want {
		t.Fatalf("log_kind = %v, want %v", got, want)
	}
	if got, want := payload["msg"], "started"; got != want {
		t.Fatalf("msg = %v, want %v", got, want)
	}
	if got, want := payload["session_id"], "session-1"; got != want {
		t.Fatalf("session_id = %v, want %v", got, want)
	}
	if got, want := payload["role"], "host"; got != want {
		t.Fatalf("role = %v, want %v", got, want)
	}
}
