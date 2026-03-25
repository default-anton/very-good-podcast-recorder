package vgpr

import (
	"bytes"
	"strings"
	"testing"
)

func TestRunRootHelp(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "dev")
	exitCode := app.Run([]string{"--help"})
	if exitCode != ExitSuccess {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitSuccess)
	}

	output := stdout.String()
	for _, snippet := range []string{
		"vgpr [global flags] <command> [args]",
		"setup <local|mock|do>",
		"backup create",
		"--deployment <name>",
	} {
		if !strings.Contains(output, snippet) {
			t.Fatalf("help output missing %q", snippet)
		}
	}
}

func TestRunVersion(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "1.2.3")
	exitCode := app.Run([]string{"--version"})
	if exitCode != ExitSuccess {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitSuccess)
	}
	if got, want := strings.TrimSpace(stdout.String()), "1.2.3"; got != want {
		t.Fatalf("version = %q, want %q", got, want)
	}
}

func TestRunHelpTakesPrecedenceOverVersion(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "1.2.3")
	exitCode := app.Run([]string{"status", "--help", "--version"})
	if exitCode != ExitSuccess {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitSuccess)
	}

	if got := stdout.String(); !strings.Contains(got, "vgpr status") {
		t.Fatalf("stdout missing status help: %q", got)
	}
	if got := stdout.String(); strings.Contains(got, "1.2.3") {
		t.Fatalf("stdout unexpectedly printed version: %q", got)
	}
}

func TestRunHelpIgnoresUnknownFlags(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "dev")
	exitCode := app.Run([]string{"status", "--help", "--wat"})
	if exitCode != ExitSuccess {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitSuccess)
	}

	if got := stdout.String(); !strings.Contains(got, "vgpr status") {
		t.Fatalf("stdout missing status help: %q", got)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunCommandHelpAfterCommandPath(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "dev")
	exitCode := app.Run([]string{"setup", "local", "--help"})
	if exitCode != ExitSuccess {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitSuccess)
	}

	if got := stdout.String(); !strings.Contains(got, "vgpr setup local [flags]") {
		t.Fatalf("help output missing setup local usage: %q", got)
	}
}

func TestRunGlobalFlagsAfterCommandPath(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "dev")
	exitCode := app.Run([]string{"status", "--json"})
	if exitCode != ExitFailure {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitFailure)
	}

	if got := stderr.String(); !strings.Contains(got, "vgpr status is not implemented yet.") {
		t.Fatalf("stderr missing stub message: %q", got)
	}
}

func TestRunDocumentedSetupLocalFlagsAccepted(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "dev")
	exitCode := app.Run([]string{"setup", "local", "--name", "demo", "--dry-run"})
	if exitCode != ExitFailure {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitFailure)
	}

	if got := stderr.String(); !strings.Contains(got, "vgpr setup local is not implemented yet.") {
		t.Fatalf("stderr missing setup local stub message: %q", got)
	}
}

func TestRunRejectsMissingValueForGlobalFlag(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "dev")
	exitCode := app.Run([]string{"--deployment", "--json", "status"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}

	if got := stderr.String(); !strings.Contains(got, "missing value for --deployment") {
		t.Fatalf("stderr missing missing-value error: %q", got)
	}
}

func TestRunRejectsMissingValueForCommandFlag(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "dev")
	exitCode := app.Run([]string{"setup", "local", "--name", "--dry-run"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}

	if got := stderr.String(); !strings.Contains(got, "missing value for --name on \"vgpr setup local\"") {
		t.Fatalf("stderr missing missing-value error: %q", got)
	}
}

func TestRunRestoreAcceptsBackupID(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "dev")
	exitCode := app.Run([]string{"restore", "backup_2026-03-20T18-42-11Z"})
	if exitCode != ExitFailure {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitFailure)
	}

	if got := stderr.String(); !strings.Contains(got, "vgpr restore is not implemented yet.") {
		t.Fatalf("stderr missing restore stub message: %q", got)
	}
}

func TestRunRejectsUnknownSetupSubcommand(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "dev")
	exitCode := app.Run([]string{"setup", "unknown"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}

	if got := stderr.String(); !strings.Contains(got, "unknown command path \"setup unknown\"") {
		t.Fatalf("stderr missing usage error: %q", got)
	}
}

func TestRunRejectsUnknownHelpTarget(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "dev")
	exitCode := app.Run([]string{"help", "nosuch"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}

	if got := stderr.String(); !strings.Contains(got, "unknown command path \"nosuch\"") {
		t.Fatalf("stderr missing help-target error: %q", got)
	}
}

func TestRunRejectsExtraArgsForHelpTarget(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "dev")
	exitCode := app.Run([]string{"help", "status", "extra"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}

	if got := stderr.String(); !strings.Contains(got, "unknown command path \"status extra\"") {
		t.Fatalf("stderr missing help extra-arg error: %q", got)
	}
}

func TestRunRejectsUnknownFlagAfterCommandPath(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "dev")
	exitCode := app.Run([]string{"status", "--wat"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}

	if got := stderr.String(); !strings.Contains(got, "unknown flag \"--wat\" for \"vgpr status\"") {
		t.Fatalf("stderr missing unknown flag error: %q", got)
	}
}

func TestRunRejectsExtraArgsForLeafCommand(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "dev")
	exitCode := app.Run([]string{"status", "unexpected"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}

	if got := stderr.String(); !strings.Contains(got, "unexpected argument \"unexpected\" for \"vgpr status\"") {
		t.Fatalf("stderr missing extra arg error: %q", got)
	}
}

func TestRunRejectsMissingSubcommandForGroupCommand(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "dev")
	exitCode := app.Run([]string{"setup"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}

	if got := stderr.String(); !strings.Contains(got, "missing subcommand for \"vgpr setup\"") {
		t.Fatalf("stderr missing subcommand error: %q", got)
	}
}

func TestRunRejectsExtraArgsForRestore(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	app := New(&stdout, &stderr, "dev")
	exitCode := app.Run([]string{"restore", "backup_2026-03-20T18-42-11Z", "extra"})
	if exitCode != ExitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, ExitUsage)
	}

	if got := stderr.String(); !strings.Contains(got, "unexpected argument \"extra\" for \"vgpr restore\"") {
		t.Fatalf("stderr missing restore extra arg error: %q", got)
	}
}
