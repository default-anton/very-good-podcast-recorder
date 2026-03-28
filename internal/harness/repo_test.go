package harness

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestRetiredImplementationPathsRemainAbsent(t *testing.T) {
	repoRoot := repoRoot(t)

	for _, relativePath := range []string{
		"cmd",
		"db",
		"deploy",
		"docs/issues",
		"internal/artifacts",
		"internal/auth",
		"internal/controlplane",
		"internal/localstack",
		"internal/logging",
		"internal/provisioning",
		"internal/recordings",
		"internal/sessions",
		"internal/uploads",
		"internal/vgpr",
		"testdata",
		"web/control/index.html",
		"web/control/src",
		"web/session/index.html",
		"web/session/src",
	} {
		_, err := os.Stat(filepath.Join(repoRoot, relativePath))
		if !errors.Is(err, fs.ErrNotExist) {
			t.Fatalf("%s should stay absent after the pivot, got err=%v", relativePath, err)
		}
	}
}

func TestHarnessSurfaceStaysPresent(t *testing.T) {
	repoRoot := repoRoot(t)

	for _, relativePath := range []string{
		"docs/README.md",
		"scripts/check",
		"scripts/format",
		"scripts/lint",
		"scripts/test",
		"scripts/typecheck",
		"web/control/tsconfig.json",
		"web/control/vite.config.ts",
		"web/session/tsconfig.json",
		"web/session/vite.config.ts",
		"web/tests/tooling-harness.spec.ts",
		"web/tests/vite-config.spec.ts",
	} {
		if _, err := os.Stat(filepath.Join(repoRoot, relativePath)); err != nil {
			t.Fatalf("%s should stay present for the harness, got err=%v", relativePath, err)
		}
	}
}

func repoRoot(t *testing.T) string {
	t.Helper()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller(0) = false")
	}

	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
}
