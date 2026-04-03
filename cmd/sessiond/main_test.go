package main

import (
	"bytes"
	"context"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunDoesNotLogListeningBeforeBindSucceeds(t *testing.T) {
	t.Parallel()

	busyListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen(): %v", err)
	}
	defer busyListener.Close()

	tempDir := t.TempDir()
	artifactRoot := filepath.Join(tempDir, "artifacts")
	sqlitePath := filepath.Join(tempDir, "state", "sessiond.sqlite")
	configPath := filepath.Join(tempDir, "sessiond.yaml")
	configFile := strings.Join([]string{
		"livekit:",
		"  api_key: lk-test-key",
		"  api_secret: lk-test-secret",
		"bootstrap:",
		"  host_join_key: host-secret",
		"  guest_join_key: guest-secret",
		"  seats:",
		"    - id: seat-host-01",
		"      role: host",
		"      display_name: Host",
		"    - id: seat-guest-01",
		"      role: guest",
		"      display_name: Guest",
	}, "\n")
	if err := os.WriteFile(configPath, []byte(configFile), 0o644); err != nil {
		t.Fatalf("os.WriteFile(%q): %v", configPath, err)
	}

	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))

	err = run(
		context.Background(),
		logger,
		[]string{
			"-config=" + configPath,
			"-listen-addr=" + busyListener.Addr().String(),
			"-session-id=sess-bind-failure",
			"-artifact-root=" + artifactRoot,
			"-sqlite-path=" + sqlitePath,
		},
		func(string) (string, bool) { return "", false },
	)
	if err == nil {
		t.Fatal("run() error = nil, want bind failure")
	}
	if !strings.Contains(err.Error(), "listen on "+busyListener.Addr().String()) {
		t.Fatalf("run() error = %q, want bind failure context", err)
	}
	if strings.Contains(logs.String(), `"msg":"sessiond listening"`) {
		t.Fatalf("run() logs contained misleading listening message: %s", logs.String())
	}
}
