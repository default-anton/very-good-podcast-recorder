package harness

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestLaterImplementationPathsRemainAbsent(t *testing.T) {
	repoRoot := repoRoot(t)

	for _, relativePath := range []string{
		"cmd",
		"db",
		"deploy",
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
		"web/session/index.html",
		"web/session/src",
	} {
		_, err := os.Stat(filepath.Join(repoRoot, relativePath))
		if !errors.Is(err, fs.ErrNotExist) {
			t.Fatalf("%s should stay absent until its implementation slice lands, got err=%v", relativePath, err)
		}
	}
}

func TestHarnessAndControlShellSurfaceStaysPresent(t *testing.T) {
	repoRoot := repoRoot(t)

	for _, relativePath := range []string{
		"docs/README.md",
		"docs/epics",
		"scripts/check",
		"scripts/format",
		"scripts/lint",
		"scripts/test",
		"scripts/typecheck",
		"web/control/index.html",
		"web/control/src/app/App.tsx",
		"web/control/src/app/components/RecordingStatusBar.tsx",
		"web/control/src/app/components/SeatList.tsx",
		"web/control/src/app/components/SessionForm.tsx",
		"web/control/src/app/routes/SessionRoomPage.tsx",
		"web/control/src/app/routes/SessionSetupPage.tsx",
		"web/control/src/app/lib/types.ts",
		"web/control/src/main.tsx",
		"web/control/src/styles.css",
		"web/control/tsconfig.json",
		"web/control/vite.config.ts",
		"web/session/tsconfig.json",
		"web/session/vite.config.ts",
		"web/tests/tooling-harness.spec.ts",
		"web/tests/vite-config.spec.ts",
	} {
		if _, err := os.Stat(filepath.Join(repoRoot, relativePath)); err != nil {
			t.Fatalf("%s should stay present for the current repo slice, got err=%v", relativePath, err)
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
