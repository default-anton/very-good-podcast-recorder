package vgpr

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/knadh/koanf/parsers/toml/v2"
	"github.com/knadh/koanf/providers/confmap"
	fileprovider "github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/v2"
)

type bootstrapConfig struct {
	ConfigPath     string
	Deployment     string `koanf:"deployment"`
	Output         string `koanf:"output"`
	NoBrowser      bool   `koanf:"no_browser"`
	ReleaseBaseURL string `koanf:"release_base_url"`
}

func loadBootstrapConfig(lookupEnv envLookup, homeDir homeDirLookup) (bootstrapConfig, error) {
	configPath, explicitConfigPath, err := resolveConfigPath(lookupEnv, homeDir)
	if err != nil {
		return bootstrapConfig{}, err
	}

	cfg := koanf.New(".")
	if err := cfg.Load(confmap.Provider(map[string]any{
		"output": "human",
	}, "."), nil); err != nil {
		return bootstrapConfig{}, fmt.Errorf("load built-in defaults: %w", err)
	}

	if err := loadUserConfig(cfg, configPath, explicitConfigPath); err != nil {
		return bootstrapConfig{}, err
	}

	if err := cfg.Load(confmap.Provider(envSettings(lookupEnv), "."), nil); err != nil {
		return bootstrapConfig{}, fmt.Errorf("load environment config: %w", err)
	}

	var out bootstrapConfig
	if err := cfg.Unmarshal("", &out); err != nil {
		return bootstrapConfig{}, fmt.Errorf("decode bootstrap config: %w", err)
	}
	out.ConfigPath = configPath

	if err := validateBootstrapConfig(out); err != nil {
		return bootstrapConfig{}, err
	}

	return out, nil
}

func resolveConfigPath(lookupEnv envLookup, homeDir homeDirLookup) (string, bool, error) {
	if path, ok := lookupEnv("VGPR_CONFIG"); ok && strings.TrimSpace(path) != "" {
		return filepath.Clean(path), true, nil
	}

	home, err := homeDir()
	if err != nil {
		return "", false, fmt.Errorf("resolve home dir: %w", err)
	}
	return filepath.Join(home, ".config", "vgpr", "config.toml"), false, nil
}

func loadUserConfig(cfg *koanf.Koanf, path string, explicit bool) error {
	_, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) && !explicit {
			return nil
		}
		return fmt.Errorf("read config file %q: %w", path, err)
	}

	if err := cfg.Load(fileprovider.Provider(path), toml.Parser()); err != nil {
		return fmt.Errorf("load config file %q: %w", path, err)
	}

	return nil
}

func envSettings(lookupEnv envLookup) map[string]any {
	settings := map[string]any{}

	if value, ok := lookupEnv("VGPR_DEPLOYMENT"); ok {
		settings["deployment"] = value
	}
	if value, ok := lookupEnv("VGPR_OUTPUT"); ok {
		settings["output"] = value
	}
	if value, ok := lookupEnv("VGPR_NO_BROWSER"); ok {
		settings["no_browser"] = parseEnvBool(value)
	}
	if value, ok := lookupEnv("VGPR_RELEASE_BASE_URL"); ok {
		settings["release_base_url"] = value
	}

	return settings
}

func parseEnvBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func validateBootstrapConfig(cfg bootstrapConfig) error {
	switch cfg.Output {
	case "", "human", "json", "plain":
		return nil
	default:
		return fmt.Errorf("invalid output mode %q: want human, json, or plain", cfg.Output)
	}
}
