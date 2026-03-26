package vgpr

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunRootHelp(t *testing.T) {
	app, stdout, stderr := newTestApp(t)

	exitCode := app.Run([]string{"--help"})
	if exitCode != ExitSuccess {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitSuccess)
	}

	output := stdout.String()
	for _, snippet := range []string{
		"Usage:",
		"Available Commands:",
		"setup",
		"backup",
		"--deployment string",
		"--version",
	} {
		if !strings.Contains(output, snippet) {
			t.Fatalf("help output missing %q", snippet)
		}
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunNoArgsShowsHelpEvenWithBrokenConfig(t *testing.T) {
	app, stdout, stderr := newTestApp(t)
	app.lookupEnv = lookupFromMap(map[string]string{
		"VGPR_OUTPUT": "yaml",
	})

	exitCode := app.Run(nil)
	if exitCode != ExitSuccess {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitSuccess)
	}
	if got := stdout.String(); !strings.Contains(got, "Usage:") {
		t.Fatalf("stdout missing root help: %q", got)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunVersion(t *testing.T) {
	app, stdout, stderr := newTestApp(t)
	app.version = "1.2.3"

	exitCode := app.Run([]string{"--version"})
	if exitCode != ExitSuccess {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitSuccess)
	}
	if got, want := strings.TrimSpace(stdout.String()), "1.2.3"; got != want {
		t.Fatalf("version = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunVersionWorksAfterCommandPath(t *testing.T) {
	app, stdout, stderr := newTestApp(t)
	app.version = "1.2.3"

	exitCode := app.Run([]string{"status", "--version"})
	if exitCode != ExitSuccess {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitSuccess)
	}
	if got, want := strings.TrimSpace(stdout.String()), "1.2.3"; got != want {
		t.Fatalf("version = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunHelpTakesPrecedenceOverVersion(t *testing.T) {
	app, stdout, stderr := newTestApp(t)
	app.version = "1.2.3"

	exitCode := app.Run([]string{"status", "--help", "--version"})
	if exitCode != ExitSuccess {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitSuccess)
	}

	if got := stdout.String(); !strings.Contains(got, "Show deployment health, version, and update availability.") {
		t.Fatalf("stdout missing status help: %q", got)
	}
	if got := stdout.String(); strings.Contains(got, "1.2.3") {
		t.Fatalf("stdout unexpectedly printed version: %q", got)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunVersionIgnoresBrokenConfig(t *testing.T) {
	app, stdout, stderr := newTestApp(t)
	app.version = "1.2.3"
	app.lookupEnv = lookupFromMap(map[string]string{
		"VGPR_OUTPUT": "yaml",
	})

	exitCode := app.Run([]string{"--version"})
	if exitCode != ExitSuccess {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitSuccess)
	}
	if got := strings.TrimSpace(stdout.String()); got != "1.2.3" {
		t.Fatalf("stdout = %q, want version", got)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunInvalidFlagStillFailsWhenVersionPresent(t *testing.T) {
	app, _, stderr := newTestApp(t)

	exitCode := app.Run([]string{"status", "--wat", "--version"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}
	if got := stderr.String(); !strings.Contains(got, "unknown flag: --wat") {
		t.Fatalf("stderr missing unknown-flag error: %q", got)
	}
}

func TestRunCommandHelpAfterCommandPath(t *testing.T) {
	app, stdout, stderr := newTestApp(t)

	exitCode := app.Run([]string{"setup", "local", "--help"})
	if exitCode != ExitSuccess {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitSuccess)
	}

	if got := stdout.String(); !strings.Contains(got, "Usage:\n  vgpr setup local") {
		t.Fatalf("help output missing setup local usage: %q", got)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunHelpCommandForKnownTarget(t *testing.T) {
	app, stdout, stderr := newTestApp(t)

	exitCode := app.Run([]string{"help", "status"})
	if exitCode != ExitSuccess {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitSuccess)
	}
	if got := stdout.String(); !strings.Contains(got, "vgpr status [flags]") {
		t.Fatalf("stdout missing status help: %q", got)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunGlobalFlagsAfterCommandPath(t *testing.T) {
	app, _, stderr := newTestApp(t)

	exitCode := app.Run([]string{"status", "--json"})
	if exitCode != ExitFailure {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitFailure)
	}

	if got := stderr.String(); !strings.Contains(got, "vgpr status is not implemented yet.") {
		t.Fatalf("stderr missing stub message: %q", got)
	}
}

func TestRunDocumentedSetupLocalFlagsAccepted(t *testing.T) {
	app, _, stderr := newTestApp(t)

	exitCode := app.Run([]string{"setup", "local", "--name", "demo", "--dry-run"})
	if exitCode != ExitFailure {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitFailure)
	}

	if got := stderr.String(); !strings.Contains(got, "vgpr setup local is not implemented yet.") {
		t.Fatalf("stderr missing setup local stub message: %q", got)
	}
}

func TestRunRejectsMutuallyExclusiveGlobalOutputFlags(t *testing.T) {
	app, _, stderr := newTestApp(t)

	exitCode := app.Run([]string{"status", "--json", "--plain"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}
	if got := stderr.String(); !strings.Contains(got, "if any flags in the group [json plain]") {
		t.Fatalf("stderr missing mutually-exclusive-flags error: %q", got)
	}
}

func TestRunRejectsMutuallyExclusiveSetupFlags(t *testing.T) {
	app, _, stderr := newTestApp(t)

	exitCode := app.Run([]string{"setup", "local", "--open", "--no-open"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}
	if got := stderr.String(); !strings.Contains(got, "if any flags in the group [open no-open]") {
		t.Fatalf("stderr missing mutually-exclusive-flags error: %q", got)
	}
}

func TestRunRestoreAcceptsBackupIDAndConfirmName(t *testing.T) {
	app, _, stderr := newTestApp(t)

	exitCode := app.Run([]string{"restore", "backup_2026-03-20T18-42-11Z", "--confirm-name", "prod"})
	if exitCode != ExitFailure {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitFailure)
	}

	if got := stderr.String(); !strings.Contains(got, "vgpr restore is not implemented yet.") {
		t.Fatalf("stderr missing restore stub message: %q", got)
	}
}

func TestRunRejectsUnknownSetupSubcommand(t *testing.T) {
	app, _, stderr := newTestApp(t)

	exitCode := app.Run([]string{"setup", "unknown"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}

	if got := stderr.String(); !strings.Contains(got, "unknown command \"unknown\" for \"vgpr setup\"") {
		t.Fatalf("stderr missing unknown-command error: %q", got)
	}
}

func TestRunRejectsUnknownFlagAfterCommandPath(t *testing.T) {
	app, _, stderr := newTestApp(t)

	exitCode := app.Run([]string{"status", "--wat"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}

	if got := stderr.String(); !strings.Contains(got, "unknown flag: --wat") {
		t.Fatalf("stderr missing unknown flag error: %q", got)
	}
}

func TestRunRejectsExtraArgsForLeafCommand(t *testing.T) {
	app, _, stderr := newTestApp(t)

	exitCode := app.Run([]string{"status", "unexpected"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}

	if got := stderr.String(); !strings.Contains(got, "unknown command \"unexpected\" for \"vgpr status\"") {
		t.Fatalf("stderr missing extra arg error: %q", got)
	}
}

func TestRunRejectsMissingSubcommandForGroupCommand(t *testing.T) {
	app, _, stderr := newTestApp(t)

	exitCode := app.Run([]string{"setup"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}

	if got := stderr.String(); !strings.Contains(got, "missing subcommand for \"vgpr setup\"") {
		t.Fatalf("stderr missing subcommand error: %q", got)
	}
}

func TestRunRejectsExtraArgsForRestore(t *testing.T) {
	app, _, stderr := newTestApp(t)

	exitCode := app.Run([]string{"restore", "backup_2026-03-20T18-42-11Z", "extra"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}

	if got := stderr.String(); !strings.Contains(got, "accepts 1 arg(s), received 2") {
		t.Fatalf("stderr missing restore extra arg error: %q", got)
	}
}

func TestRunRejectsBrokenBootstrapConfigOnCommandExecution(t *testing.T) {
	app, _, stderr := newTestApp(t)
	app.lookupEnv = lookupFromMap(map[string]string{
		"VGPR_OUTPUT": "yaml",
	})

	exitCode := app.Run([]string{"status"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}
	if got := stderr.String(); !strings.Contains(got, "invalid output mode \"yaml\"") {
		t.Fatalf("stderr missing config error: %q", got)
	}
}

func TestLoadBootstrapConfigDefaults(t *testing.T) {
	cfg, err := loadBootstrapConfig(lookupFromMap(nil), func() (string, error) {
		return "/tmp/anton-home", nil
	})
	if err != nil {
		t.Fatalf("loadBootstrapConfig error = %v", err)
	}

	if got, want := cfg.ConfigPath, filepath.Join("/tmp/anton-home", ".config", "vgpr", "config.toml"); got != want {
		t.Fatalf("ConfigPath = %q, want %q", got, want)
	}
	if got, want := cfg.Output, "human"; got != want {
		t.Fatalf("Output = %q, want %q", got, want)
	}
}

func TestLoadBootstrapConfigEnvOverridesUserConfig(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.toml")
	writeFileForTest(t, configPath, "deployment = \"from-file\"\noutput = \"plain\"\n")

	cfg, err := loadBootstrapConfig(lookupFromMap(map[string]string{
		"VGPR_CONFIG":     configPath,
		"VGPR_DEPLOYMENT": "from-env",
		"VGPR_OUTPUT":     "json",
	}), func() (string, error) {
		return "/unused-home", nil
	})
	if err != nil {
		t.Fatalf("loadBootstrapConfig error = %v", err)
	}

	if got, want := cfg.Deployment, "from-env"; got != want {
		t.Fatalf("Deployment = %q, want %q", got, want)
	}
	if got, want := cfg.Output, "json"; got != want {
		t.Fatalf("Output = %q, want %q", got, want)
	}
}

func TestLoadBootstrapConfigRejectsMissingExplicitConfig(t *testing.T) {
	_, err := loadBootstrapConfig(lookupFromMap(map[string]string{
		"VGPR_CONFIG": "/tmp/does-not-exist.toml",
	}), func() (string, error) {
		return "/unused-home", nil
	})
	if err == nil {
		t.Fatal("loadBootstrapConfig error = nil, want error")
	}
	if !strings.Contains(err.Error(), "read config file") {
		t.Fatalf("error = %q, want read config file", err)
	}
}

func TestLoadBootstrapConfigRejectsInvalidOutput(t *testing.T) {
	_, err := loadBootstrapConfig(lookupFromMap(map[string]string{
		"VGPR_OUTPUT": "yaml",
	}), func() (string, error) {
		return "/unused-home", nil
	})
	if err == nil {
		t.Fatal("loadBootstrapConfig error = nil, want error")
	}
	if !strings.Contains(err.Error(), "invalid output mode \"yaml\"") {
		t.Fatalf("error = %q, want invalid output mode", err)
	}
}

func TestLoadBootstrapConfigPropagatesHomeDirErrors(t *testing.T) {
	want := errors.New("boom")
	_, err := loadBootstrapConfig(lookupFromMap(nil), func() (string, error) {
		return "", want
	})
	if !errors.Is(err, want) {
		t.Fatalf("error = %v, want wrapped %v", err, want)
	}
}

func TestLoadBootstrapConfigAllowsExplicitConfigWithoutHomeDir(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.toml")
	writeFileForTest(t, configPath, "output = \"plain\"\n")

	cfg, err := loadBootstrapConfig(lookupFromMap(map[string]string{
		"VGPR_CONFIG": configPath,
	}), func() (string, error) {
		return "", errors.New("home should not be used")
	})
	if err != nil {
		t.Fatalf("loadBootstrapConfig error = %v", err)
	}
	if got, want := cfg.ConfigPath, configPath; got != want {
		t.Fatalf("ConfigPath = %q, want %q", got, want)
	}
	if got, want := cfg.Output, "plain"; got != want {
		t.Fatalf("Output = %q, want %q", got, want)
	}
}

func newTestApp(t *testing.T) (*App, *bytes.Buffer, *bytes.Buffer) {
	t.Helper()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	app := New(&stdout, &stderr, "dev")
	app.lookupEnv = lookupFromMap(nil)
	app.userHomeDir = func() (string, error) {
		return t.TempDir(), nil
	}
	return app, &stdout, &stderr
}

func lookupFromMap(values map[string]string) envLookup {
	return func(key string) (string, bool) {
		if values == nil {
			return "", false
		}
		value, ok := values[key]
		return value, ok
	}
}

func writeFileForTest(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%q): %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile(%q): %v", path, err)
	}
}
