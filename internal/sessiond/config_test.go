package sessiond

import (
	"os"
	"path/filepath"
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

	tempDir := t.TempDir()
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
	if err := osWriteFile(configPath, configFile); err != nil {
		t.Fatalf("osWriteFile(%q): %v", configPath, err)
	}

	cfg, err := LoadConfig(nil, lookupEnvFromMap(map[string]string{
		envConfigPath: configPath,
		envSessionID:  "sess-default-port",
	}))
	if err != nil {
		t.Fatalf("LoadConfig(): %v", err)
	}

	if cfg.ListenAddr != "127.0.0.1:8081" {
		t.Fatalf("ListenAddr = %q, want %q", cfg.ListenAddr, "127.0.0.1:8081")
	}
}

func TestLoadConfigParsesBootstrapAndLiveKitYAML(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "sessiond.yaml")
	configFile := strings.Join([]string{
		"session_id: sess-bootstrap-config",
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

	if err := osWriteFile(configPath, configFile); err != nil {
		t.Fatalf("osWriteFile(%q): %v", configPath, err)
	}

	cfg, err := LoadConfig(nil, lookupEnvFromMap(map[string]string{envConfigPath: configPath}))
	if err != nil {
		t.Fatalf("LoadConfig(): %v", err)
	}

	if cfg.LiveKit.APIKey != "lk-test-key" {
		t.Fatalf("LiveKit.APIKey = %q, want %q", cfg.LiveKit.APIKey, "lk-test-key")
	}
	if cfg.LiveKit.APISecret != "lk-test-secret" {
		t.Fatalf("LiveKit.APISecret = %q, want %q", cfg.LiveKit.APISecret, "lk-test-secret")
	}
	if cfg.Bootstrap.HostJoinKey != "host-secret" {
		t.Fatalf("Bootstrap.HostJoinKey = %q, want %q", cfg.Bootstrap.HostJoinKey, "host-secret")
	}
	if cfg.Bootstrap.GuestJoinKey != "guest-secret" {
		t.Fatalf("Bootstrap.GuestJoinKey = %q, want %q", cfg.Bootstrap.GuestJoinKey, "guest-secret")
	}
	if len(cfg.Bootstrap.Seats) != 2 {
		t.Fatalf("len(Bootstrap.Seats) = %d, want 2", len(cfg.Bootstrap.Seats))
	}
	if cfg.Bootstrap.Seats[0].ID != "seat-host-01" || cfg.Bootstrap.Seats[1].ID != "seat-guest-01" {
		t.Fatalf("Bootstrap.Seats ids = %#v, want host/guest bootstrap seats", cfg.Bootstrap.Seats)
	}
}

func TestLoadConfigParsesBootstrapAndLiveKitEnv(t *testing.T) {
	t.Parallel()

	cfg, err := LoadConfig(nil, lookupEnvFromMap(map[string]string{
		envSessionID:             "sess-bootstrap-env",
		envLiveKitAPIKey:         "lk-env-key",
		envLiveKitAPISecret:      "lk-env-secret",
		envBootstrapHostJoinKey:  "host-env-secret",
		envBootstrapGuestJoinKey: "guest-env-secret",
		envBootstrapSeatsJSON:    `[{"id":"seat-host-01","role":"host","display_name":"Anton Host"},{"id":"seat-guest-02","role":"guest","display_name":"Mara Chen"}]`,
	}))
	if err != nil {
		t.Fatalf("LoadConfig(): %v", err)
	}

	if cfg.LiveKit.APIKey != "lk-env-key" {
		t.Fatalf("LiveKit.APIKey = %q, want %q", cfg.LiveKit.APIKey, "lk-env-key")
	}
	if cfg.LiveKit.APISecret != "lk-env-secret" {
		t.Fatalf("LiveKit.APISecret = %q, want %q", cfg.LiveKit.APISecret, "lk-env-secret")
	}
	if cfg.Bootstrap.HostJoinKey != "host-env-secret" {
		t.Fatalf("Bootstrap.HostJoinKey = %q, want %q", cfg.Bootstrap.HostJoinKey, "host-env-secret")
	}
	if cfg.Bootstrap.GuestJoinKey != "guest-env-secret" {
		t.Fatalf("Bootstrap.GuestJoinKey = %q, want %q", cfg.Bootstrap.GuestJoinKey, "guest-env-secret")
	}
	if len(cfg.Bootstrap.Seats) != 2 {
		t.Fatalf("len(Bootstrap.Seats) = %d, want 2", len(cfg.Bootstrap.Seats))
	}
	if cfg.Bootstrap.Seats[0].DisplayName != "Anton Host" || cfg.Bootstrap.Seats[1].DisplayName != "Mara Chen" {
		t.Fatalf("Bootstrap.Seats = %#v, want env-provided bootstrap seats", cfg.Bootstrap.Seats)
	}
}

func TestLoadConfigRejectsInvalidBootstrapSeatsJSON(t *testing.T) {
	t.Parallel()

	_, err := LoadConfig(nil, lookupEnvFromMap(map[string]string{
		envSessionID:          "sess-bootstrap-env-invalid",
		envBootstrapSeatsJSON: `{invalid}`,
	}))
	if err == nil {
		t.Fatal("LoadConfig() error = nil, want invalid bootstrap seats env error")
	}
	if !strings.Contains(err.Error(), envBootstrapSeatsJSON) {
		t.Fatalf("LoadConfig() error = %q, want %q context", err, envBootstrapSeatsJSON)
	}
}

func TestLoadConfigDoesNotRequireTemporaryRuntimeBootstrapConfig(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "sessiond.yaml")
	configFile := strings.Join([]string{
		"session_id: sess-missing-runtime-auth",
	}, "\n")
	if err := osWriteFile(configPath, configFile); err != nil {
		t.Fatalf("osWriteFile(%q): %v", configPath, err)
	}

	cfg, err := LoadConfig(nil, lookupEnvFromMap(map[string]string{envConfigPath: configPath}))
	if err != nil {
		t.Fatalf("LoadConfig(): %v", err)
	}
	if cfg.SessionID != "sess-missing-runtime-auth" {
		t.Fatalf("SessionID = %q, want %q", cfg.SessionID, "sess-missing-runtime-auth")
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

func lookupEnvFromMap(values map[string]string) lookupEnvFunc {
	return func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	}
}

func osWriteFile(path string, contents string) error {
	return os.WriteFile(path, []byte(contents), 0o644)
}
