package controlplane

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/default-anton/very-good-podcast-recorder/internal/logging"
)

func TestNewHandlerHealthz(t *testing.T) {
	logger := logging.NewLogger(nil, "controlplane", logging.KindService, slog.LevelInfo)
	handler := NewHandler("dev", logger)

	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if got, want := response.Code, http.StatusOK; got != want {
		t.Fatalf("status code = %d, want %d", got, want)
	}

	var payload map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	if got, want := payload["service"], "controlplane"; got != want {
		t.Fatalf("service = %q, want %q", got, want)
	}
	if got, want := payload["status"], "ok"; got != want {
		t.Fatalf("status = %q, want %q", got, want)
	}
}

func TestNewHandlerUnknownPathReturnsNotFound(t *testing.T) {
	logger := logging.NewLogger(nil, "controlplane", logging.KindService, slog.LevelInfo)
	handler := NewHandler("dev", logger)

	request := httptest.NewRequest(http.MethodGet, "/does-not-exist", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if got, want := response.Code, http.StatusNotFound; got != want {
		t.Fatalf("status code = %d, want %d", got, want)
	}
}

type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (buffer *lockedBuffer) Write(p []byte) (int, error) {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	return buffer.buf.Write(p)
}

func (buffer *lockedBuffer) String() string {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	return buffer.buf.String()
}

func TestRunDoesNotLogListeningOnBindFailure(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()

	var buffer bytes.Buffer
	logger := logging.NewLogger(&buffer, "controlplane", logging.KindService, slog.LevelInfo)

	err = Run(context.Background(), Config{Addr: listener.Addr().String(), Version: "dev"}, logger)
	if err == nil {
		t.Fatal("expected bind failure")
	}
	if !strings.Contains(err.Error(), "listen control plane") {
		t.Fatalf("error = %q, want listen control plane context", err)
	}
	if strings.Contains(buffer.String(), "control plane listening") {
		t.Fatalf("unexpected listening log on bind failure: %q", buffer.String())
	}
}

func TestRunLogsBoundAddrWhenUsingEphemeralPort(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var buffer lockedBuffer
	logger := logging.NewLogger(&buffer, "controlplane", logging.KindService, slog.LevelInfo)

	errCh := make(chan error, 1)
	go func() {
		errCh <- Run(ctx, Config{Addr: "127.0.0.1:0", Version: "dev"}, logger)
	}()

	deadline := time.Now().Add(2 * time.Second)
	for {
		logs := buffer.String()
		if strings.Contains(logs, "control plane listening") {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for listening log: %q", logs)
		}
		time.Sleep(10 * time.Millisecond)
	}

	cancel()
	if err := <-errCh; err != nil {
		t.Fatalf("run control plane: %v", err)
	}

	logs := buffer.String()
	if strings.Contains(logs, `"addr":"127.0.0.1:0"`) {
		t.Fatalf("logs reported requested addr instead of bound addr: %q", logs)
	}
	if !strings.Contains(logs, `"msg":"control plane stopped"`) {
		t.Fatalf("missing stop log: %q", logs)
	}
}
