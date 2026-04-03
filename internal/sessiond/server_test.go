package sessiond

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestLoadConfigMergesFileEnvAndFlags(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "sessiond.yaml")
	configFile := strings.Join([]string{
		"listen_addr: 0.0.0.0:7000",
		"session_id: sess-file",
		"release_version: file-release",
	}, "\n")

	if err := osWriteFile(configPath, configFile); err != nil {
		t.Fatalf("osWriteFile(%q): %v", configPath, err)
	}

	cfg, err := LoadConfig(
		[]string{
			"-listen-addr=127.0.0.1:9100",
			"-session-id=sess-flag",
		},
		lookupEnvFromMap(map[string]string{
			envConfigPath:     configPath,
			envArtifactRoot:   filepath.Join(tempDir, "artifacts-from-env"),
			envReleaseVersion: "env-release",
		}),
	)
	if err != nil {
		t.Fatalf("LoadConfig(): %v", err)
	}

	if cfg.ListenAddr != "127.0.0.1:9100" {
		t.Fatalf("ListenAddr = %q, want %q", cfg.ListenAddr, "127.0.0.1:9100")
	}
	if cfg.SessionID != "sess-flag" {
		t.Fatalf("SessionID = %q, want %q", cfg.SessionID, "sess-flag")
	}
	if cfg.ReleaseVersion != "env-release" {
		t.Fatalf("ReleaseVersion = %q, want %q", cfg.ReleaseVersion, "env-release")
	}

	wantArtifactRoot := filepath.Join(tempDir, "artifacts-from-env")
	if cfg.ArtifactRoot != wantArtifactRoot {
		t.Fatalf("ArtifactRoot = %q, want %q", cfg.ArtifactRoot, wantArtifactRoot)
	}

	wantSQLitePath := filepath.Join(wantArtifactRoot, "sessiond.sqlite")
	if cfg.SQLitePath != wantSQLitePath {
		t.Fatalf("SQLitePath = %q, want %q", cfg.SQLitePath, wantSQLitePath)
	}
}

func TestLoadConfigResolvesConfigRelativePaths(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "sessiond.yaml")
	configFile := strings.Join([]string{
		"session_id: sess-relative",
		"artifact_root: artifacts",
		"sqlite_path: state/sessiond.sqlite",
	}, "\n")

	if err := osWriteFile(configPath, configFile); err != nil {
		t.Fatalf("osWriteFile(%q): %v", configPath, err)
	}

	cfg, err := LoadConfig(nil, lookupEnvFromMap(map[string]string{envConfigPath: configPath}))
	if err != nil {
		t.Fatalf("LoadConfig(): %v", err)
	}

	if cfg.ArtifactRoot != filepath.Join(tempDir, "artifacts") {
		t.Fatalf("ArtifactRoot = %q, want %q", cfg.ArtifactRoot, filepath.Join(tempDir, "artifacts"))
	}
	if cfg.SQLitePath != filepath.Join(tempDir, "state", "sessiond.sqlite") {
		t.Fatalf("SQLitePath = %q, want %q", cfg.SQLitePath, filepath.Join(tempDir, "state", "sessiond.sqlite"))
	}
}

func TestLoadConfigUsesLocalStackDefaultListenAddr(t *testing.T) {
	t.Parallel()

	cfg, err := LoadConfig(nil, lookupEnvFromMap(map[string]string{envSessionID: "sess-default-port"}))
	if err != nil {
		t.Fatalf("LoadConfig(): %v", err)
	}

	if cfg.ListenAddr != "127.0.0.1:8081" {
		t.Fatalf("ListenAddr = %q, want %q", cfg.ListenAddr, "127.0.0.1:8081")
	}
}

func TestLoadConfigRequiresSessionID(t *testing.T) {
	t.Parallel()

	_, err := LoadConfig(nil, lookupEnvFromMap(nil))
	if err == nil {
		t.Fatal("LoadConfig() error = nil, want missing session id error")
	}
	if !strings.Contains(err.Error(), "session id is required") {
		t.Fatalf("LoadConfig() error = %q, want missing session id message", err)
	}
}

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
	cfg := Config{
		ListenAddr:     "127.0.0.1:8081",
		SessionID:      "sess-readyz-proof",
		ReleaseVersion: "test",
		ArtifactRoot:   filepath.Join(tempDir, "artifacts"),
		SQLitePath:     filepath.Join(tempDir, "state", "sessiond.sqlite"),
	}

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

	healthStatusCode, healthResponse := callHealthEndpoint(t, server, http.MethodGet, "/healthz")
	if healthStatusCode != http.StatusOK {
		t.Fatalf("/healthz status code = %d, want %d", healthStatusCode, http.StatusOK)
	}
	if healthResponse.Status != "ok" {
		t.Fatalf("/healthz status = %q, want %q", healthResponse.Status, "ok")
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

func lookupEnvFromMap(values map[string]string) lookupEnvFunc {
	return func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	}
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

func osWriteFile(path string, contents string) error {
	return os.WriteFile(path, []byte(contents), 0o644)
}
