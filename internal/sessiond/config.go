package sessiond

import (
	"bytes"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	defaultArtifactRoot = "./var/sessiond"
	defaultListenAddr   = "127.0.0.1:8081"
	defaultVersion      = "dev"
	runtimeDirMode      = 0o700
	envArtifactRoot     = "SESSIOND_ARTIFACT_ROOT"
	envConfigPath       = "SESSIOND_CONFIG"
	envListenAddr       = "SESSIOND_LISTEN_ADDR"
	envReleaseVersion   = "SESSIOND_RELEASE_VERSION"
	envSessionID        = "SESSIOND_SESSION_ID"
	envSQLitePath       = "SESSIOND_SQLITE_PATH"
)

type Config struct {
	ListenAddr     string `yaml:"listen_addr"`
	SessionID      string `yaml:"session_id"`
	ReleaseVersion string `yaml:"release_version"`
	ArtifactRoot   string `yaml:"artifact_root"`
	SQLitePath     string `yaml:"sqlite_path"`
}

type lookupEnvFunc func(string) (string, bool)

type stringFlag struct {
	value string
	set   bool
}

func (f *stringFlag) String() string {
	return f.value
}

func (f *stringFlag) Set(value string) error {
	f.value = value
	f.set = true
	return nil
}

func LoadConfig(args []string, lookupEnv lookupEnvFunc) (Config, error) {
	configPath := envOrDefault(lookupEnv, envConfigPath, "")
	cfg := defaultConfig()

	flagSet := flag.NewFlagSet("sessiond", flag.ContinueOnError)
	flagSet.SetOutput(io.Discard)

	var configPathFlag stringFlag
	var listenAddrFlag stringFlag
	var sessionIDFlag stringFlag
	var releaseVersionFlag stringFlag
	var artifactRootFlag stringFlag
	var sqlitePathFlag stringFlag

	flagSet.Var(&configPathFlag, "config", "path to the sessiond YAML config")
	flagSet.Var(&listenAddrFlag, "listen-addr", "HTTP listen address for sessiond")
	flagSet.Var(&sessionIDFlag, "session-id", "session id this sessiond process serves")
	flagSet.Var(&releaseVersionFlag, "release-version", "release version to report from health endpoints")
	flagSet.Var(&artifactRootFlag, "artifact-root", "artifact root for this session")
	flagSet.Var(&sqlitePathFlag, "sqlite-path", "SQLite path for this session")

	if err := flagSet.Parse(args); err != nil {
		return Config{}, fmt.Errorf("parse sessiond flags: %w", err)
	}

	if flagSet.NArg() != 0 {
		return Config{}, fmt.Errorf("sessiond does not accept positional arguments: %s", strings.Join(flagSet.Args(), " "))
	}

	if configPathFlag.set {
		configPath = configPathFlag.value
	}

	if configPath != "" {
		fileConfig, err := loadConfigFile(configPath)
		if err != nil {
			return Config{}, err
		}
		resolveConfigFileRelativePaths(&fileConfig, filepath.Dir(configPath))
		mergeConfig(&cfg, fileConfig)
	}

	applyEnvOverrides(&cfg, lookupEnv)
	applyFlagOverrides(&cfg, listenAddrFlag, sessionIDFlag, releaseVersionFlag, artifactRootFlag, sqlitePathFlag)
	trimConfig(&cfg)

	if cfg.ListenAddr == "" {
		return Config{}, fmt.Errorf("sessiond listen address is required")
	}
	if cfg.SessionID == "" {
		return Config{}, fmt.Errorf("sessiond session id is required; set -session-id, SESSIOND_SESSION_ID, or session_id in the config file")
	}
	if cfg.ArtifactRoot == "" {
		return Config{}, fmt.Errorf("sessiond artifact root is required")
	}
	if cfg.SQLitePath == "" {
		cfg.SQLitePath = filepath.Join(cfg.ArtifactRoot, "sessiond.sqlite")
	}

	if err := makeAbsolutePaths(&cfg); err != nil {
		return Config{}, err
	}

	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func (cfg Config) Validate() error {
	switch {
	case strings.TrimSpace(cfg.ListenAddr) == "":
		return fmt.Errorf("sessiond listen address is required")
	case strings.TrimSpace(cfg.SessionID) == "":
		return fmt.Errorf("sessiond session id is required; set -session-id, SESSIOND_SESSION_ID, or session_id in the config file")
	case strings.TrimSpace(cfg.ArtifactRoot) == "":
		return fmt.Errorf("sessiond artifact root is required")
	case strings.TrimSpace(cfg.SQLitePath) == "":
		return fmt.Errorf("sessiond sqlite path is required")
	}

	return nil
}

func PrepareRuntime(cfg Config) error {
	if err := ensurePrivateDirectory(cfg.ArtifactRoot); err != nil {
		return fmt.Errorf("prepare artifact root %s: %w", cfg.ArtifactRoot, err)
	}

	sqliteDir := filepath.Dir(cfg.SQLitePath)
	if err := ensurePrivateDirectory(sqliteDir); err != nil {
		return fmt.Errorf("prepare sqlite directory %s: %w", sqliteDir, err)
	}

	return nil
}

func defaultConfig() Config {
	return Config{
		ListenAddr:     defaultListenAddr,
		ReleaseVersion: defaultVersion,
		ArtifactRoot:   defaultArtifactRoot,
	}
}

func loadConfigFile(path string) (Config, error) {
	rawConfig, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("read sessiond config %s: %w", path, err)
	}

	decoder := yaml.NewDecoder(bytes.NewReader(rawConfig))
	decoder.KnownFields(true)

	var cfg Config
	if err := decoder.Decode(&cfg); err != nil {
		return Config{}, fmt.Errorf("decode sessiond config %s: %w", path, err)
	}

	return cfg, nil
}

func mergeConfig(dst *Config, src Config) {
	if src.ListenAddr != "" {
		dst.ListenAddr = src.ListenAddr
	}
	if src.SessionID != "" {
		dst.SessionID = src.SessionID
	}
	if src.ReleaseVersion != "" {
		dst.ReleaseVersion = src.ReleaseVersion
	}
	if src.ArtifactRoot != "" {
		dst.ArtifactRoot = src.ArtifactRoot
	}
	if src.SQLitePath != "" {
		dst.SQLitePath = src.SQLitePath
	}
}

func resolveConfigFileRelativePaths(cfg *Config, baseDir string) {
	if cfg.ArtifactRoot != "" && !filepath.IsAbs(cfg.ArtifactRoot) {
		cfg.ArtifactRoot = filepath.Join(baseDir, cfg.ArtifactRoot)
	}
	if cfg.SQLitePath != "" && !filepath.IsAbs(cfg.SQLitePath) {
		cfg.SQLitePath = filepath.Join(baseDir, cfg.SQLitePath)
	}
}

func trimConfig(cfg *Config) {
	cfg.ListenAddr = strings.TrimSpace(cfg.ListenAddr)
	cfg.SessionID = strings.TrimSpace(cfg.SessionID)
	cfg.ReleaseVersion = strings.TrimSpace(cfg.ReleaseVersion)
	cfg.ArtifactRoot = strings.TrimSpace(cfg.ArtifactRoot)
	cfg.SQLitePath = strings.TrimSpace(cfg.SQLitePath)
}

func applyEnvOverrides(cfg *Config, lookupEnv lookupEnvFunc) {
	applyStringEnv(&cfg.ListenAddr, lookupEnv, envListenAddr)
	applyStringEnv(&cfg.SessionID, lookupEnv, envSessionID)
	applyStringEnv(&cfg.ReleaseVersion, lookupEnv, envReleaseVersion)
	applyStringEnv(&cfg.ArtifactRoot, lookupEnv, envArtifactRoot)
	applyStringEnv(&cfg.SQLitePath, lookupEnv, envSQLitePath)
}

func applyFlagOverrides(
	cfg *Config,
	listenAddrFlag stringFlag,
	sessionIDFlag stringFlag,
	releaseVersionFlag stringFlag,
	artifactRootFlag stringFlag,
	sqlitePathFlag stringFlag,
) {
	applyStringFlag(&cfg.ListenAddr, listenAddrFlag)
	applyStringFlag(&cfg.SessionID, sessionIDFlag)
	applyStringFlag(&cfg.ReleaseVersion, releaseVersionFlag)
	applyStringFlag(&cfg.ArtifactRoot, artifactRootFlag)
	applyStringFlag(&cfg.SQLitePath, sqlitePathFlag)
}

func applyStringEnv(target *string, lookupEnv lookupEnvFunc, key string) {
	if value, ok := lookupEnv(key); ok && value != "" {
		*target = value
	}
}

func applyStringFlag(target *string, flagValue stringFlag) {
	if flagValue.set {
		*target = flagValue.value
	}
}

func envOrDefault(lookupEnv lookupEnvFunc, key string, fallback string) string {
	if value, ok := lookupEnv(key); ok && value != "" {
		return value
	}

	return fallback
}

func makeAbsolutePaths(cfg *Config) error {
	artifactRoot, err := filepath.Abs(cfg.ArtifactRoot)
	if err != nil {
		return fmt.Errorf("resolve artifact root %s: %w", cfg.ArtifactRoot, err)
	}
	cfg.ArtifactRoot = artifactRoot

	sqlitePath, err := filepath.Abs(cfg.SQLitePath)
	if err != nil {
		return fmt.Errorf("resolve sqlite path %s: %w", cfg.SQLitePath, err)
	}
	cfg.SQLitePath = sqlitePath

	return nil
}

func ensurePrivateDirectory(path string) error {
	if err := os.MkdirAll(path, runtimeDirMode); err != nil {
		return err
	}

	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("path exists but is not a directory")
	}

	if info.Mode().Perm() != runtimeDirMode {
		if err := os.Chmod(path, runtimeDirMode); err != nil {
			return fmt.Errorf("set permissions to %04o: %w", runtimeDirMode, err)
		}
	}

	return nil
}
