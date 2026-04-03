package main

import (
	"bytes"
	"context"
	"log/slog"
	"net"
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

	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))

	err = run(
		context.Background(),
		logger,
		[]string{
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
