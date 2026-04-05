package sessiond

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestPrepareRuntimeCreatesPrivateDirectories(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("directory permission bits are not reliable on Windows")
	}

	tempDir := t.TempDir()
	artifactRoot := filepath.Join(tempDir, "artifacts")
	sqliteDir := filepath.Join(tempDir, "state")
	cfg := Config{
		ListenAddr:     "127.0.0.1:8081",
		SessionID:      "sess-private-dirs",
		ReleaseVersion: "test",
		ArtifactRoot:   artifactRoot,
		SQLitePath:     filepath.Join(sqliteDir, "sessiond.sqlite"),
	}

	if err := os.MkdirAll(artifactRoot, 0o755); err != nil {
		t.Fatalf("os.MkdirAll(%q): %v", artifactRoot, err)
	}
	if err := os.MkdirAll(sqliteDir, 0o777); err != nil {
		t.Fatalf("os.MkdirAll(%q): %v", sqliteDir, err)
	}

	if err := os.Chmod(artifactRoot, 0o755); err != nil {
		t.Fatalf("os.Chmod(%q): %v", artifactRoot, err)
	}
	if err := os.Chmod(sqliteDir, 0o777); err != nil {
		t.Fatalf("os.Chmod(%q): %v", sqliteDir, err)
	}

	if err := PrepareRuntime(cfg); err != nil {
		t.Fatalf("PrepareRuntime(): %v", err)
	}

	assertDirectoryPermissions(t, artifactRoot, runtimeDirMode)
	assertDirectoryPermissions(t, sqliteDir, runtimeDirMode)
}

func TestReadyEndpointTracksRuntimePreparation(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	cfg := newTestConfig(tempDir, "sess-readyz-proof")

	server, err := NewServer(cfg)
	if err != nil {
		t.Fatalf("NewServer(): %v", err)
	}

	statusCodeBefore, responseBefore := callHealthEndpoint(t, server, http.MethodGet, "/readyz")
	if statusCodeBefore != http.StatusServiceUnavailable {
		t.Fatalf("/readyz status code before PrepareRuntime = %d, want %d", statusCodeBefore, http.StatusServiceUnavailable)
	}
	if responseBefore.Status != "not_ready" {
		t.Fatalf("/readyz status before PrepareRuntime = %q, want %q", responseBefore.Status, "not_ready")
	}
	if responseBefore.Checks.ArtifactRootExists {
		t.Fatal("ArtifactRootExists before PrepareRuntime = true, want false")
	}
	if responseBefore.Checks.SQLiteDirExists {
		t.Fatal("SQLiteDirExists before PrepareRuntime = true, want false")
	}
	if responseBefore.Checks.SnapshotLoaded {
		t.Fatal("SnapshotLoaded before PrepareRuntime = true, want false")
	}
	if responseBefore.Checks.SQLiteWritable {
		t.Fatal("SQLiteWritable before PrepareRuntime = true, want false")
	}

	if err := PrepareRuntime(cfg); err != nil {
		t.Fatalf("PrepareRuntime(): %v", err)
	}

	statusCodeAfter, responseAfter := callHealthEndpoint(t, server, http.MethodGet, "/readyz")
	if statusCodeAfter != http.StatusOK {
		t.Fatalf("/readyz status code after PrepareRuntime = %d, want %d", statusCodeAfter, http.StatusOK)
	}
	if responseAfter.Status != "ready" {
		t.Fatalf("/readyz status after PrepareRuntime = %q, want %q", responseAfter.Status, "ready")
	}
	if !responseAfter.Checks.ArtifactRootExists {
		t.Fatal("ArtifactRootExists after PrepareRuntime = false, want true")
	}
	if !responseAfter.Checks.SQLiteDirExists {
		t.Fatal("SQLiteDirExists after PrepareRuntime = false, want true")
	}
	if !responseAfter.Checks.SnapshotLoaded {
		t.Fatal("SnapshotLoaded after PrepareRuntime = false, want true")
	}
	if !responseAfter.Checks.SQLiteWritable {
		t.Fatal("SQLiteWritable after PrepareRuntime = false, want true")
	}

	healthStatusCode, healthResponse := callHealthEndpoint(t, server, http.MethodGet, "/healthz")
	if healthStatusCode != http.StatusOK {
		t.Fatalf("/healthz status code = %d, want %d", healthStatusCode, http.StatusOK)
	}
	if healthResponse.Status != "ok" {
		t.Fatalf("/healthz status = %q, want %q", healthResponse.Status, "ok")
	}
}

func TestInitializeRequiresLiveKitAndBootstrap(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	cfg := Config{
		ListenAddr:     "127.0.0.1:8081",
		SessionID:      "sess-missing-runtime-auth",
		ReleaseVersion: "test",
		ArtifactRoot:   filepath.Join(tempDir, "artifacts"),
		SQLitePath:     filepath.Join(tempDir, "state", "sessiond.sqlite"),
	}
	if err := PrepareRuntime(cfg); err != nil {
		t.Fatalf("PrepareRuntime(): %v", err)
	}

	server, err := NewServer(cfg)
	if err != nil {
		t.Fatalf("NewServer(): %v", err)
	}
	if err := server.Initialize(context.Background()); err == nil {
		t.Fatal("server.Initialize() error = nil, want missing runtime config failure")
	} else if !strings.Contains(err.Error(), "livekit api key") {
		t.Fatalf("server.Initialize() error = %q, want missing livekit api key message", err)
	}
}

func TestInitializeFailsWhenSQLiteStateIsNotUsable(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	cfg := newTestConfig(tempDir, "sess-init-fails")
	if err := PrepareRuntime(cfg); err != nil {
		t.Fatalf("PrepareRuntime(): %v", err)
	}
	if err := os.Mkdir(cfg.SQLitePath, runtimeDirMode); err != nil {
		t.Fatalf("os.Mkdir(%q): %v", cfg.SQLitePath, err)
	}

	server, err := NewServer(cfg)
	if err != nil {
		t.Fatalf("NewServer(): %v", err)
	}

	if err := server.Initialize(context.Background()); err == nil {
		t.Fatal("server.Initialize() error = nil, want sqlite initialization failure")
	}

	statusCode, response := callHealthEndpoint(t, server, http.MethodGet, "/readyz")
	if statusCode != http.StatusServiceUnavailable {
		t.Fatalf("/readyz status code with unusable sqlite state = %d, want %d", statusCode, http.StatusServiceUnavailable)
	}
	if response.Checks.SnapshotLoaded {
		t.Fatal("SnapshotLoaded with unusable sqlite state = true, want false")
	}
	if response.Checks.SQLiteWritable {
		t.Fatal("SQLiteWritable with unusable sqlite state = true, want false")
	}
}

func TestInitializeRejectsBootstrapDrift(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	cfg := newTestConfig(tempDir, "sess-bootstrap-drift")
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
	if err := server.Close(); err != nil {
		t.Fatalf("server.Close(): %v", err)
	}

	driftedCfg := newTestConfig(tempDir, "sess-bootstrap-drift")
	driftedCfg.Bootstrap.GuestJoinKey = "guest-secret-rotated"

	driftedServer, err := NewServer(driftedCfg)
	if err != nil {
		t.Fatalf("NewServer(): %v", err)
	}
	if err := driftedServer.Initialize(context.Background()); err == nil {
		t.Fatal("server.Initialize() error = nil, want bootstrap drift failure")
	} else if !strings.Contains(err.Error(), "bootstrap state drifted") {
		t.Fatalf("server.Initialize() error = %q, want bootstrap drift message", err)
	}
}

func callHealthEndpoint(t *testing.T, server *Server, method string, path string) (int, healthResponse) {
	t.Helper()

	request := httptest.NewRequest(method, path, nil)
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)

	var response healthResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("json.Unmarshal(%s): %v", path, err)
	}

	return recorder.Code, response
}

func assertDirectoryPermissions(t *testing.T, path string, want os.FileMode) {
	t.Helper()

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("os.Stat(%q): %v", path, err)
	}
	if !info.IsDir() {
		t.Fatalf("%s is not a directory", path)
	}
	if got := info.Mode().Perm(); got != want {
		t.Fatalf("%s permissions = %04o, want %04o", path, got, want)
	}
}
