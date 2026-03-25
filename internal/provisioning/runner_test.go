package provisioning

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/default-anton/very-good-podcast-recorder/internal/logging"
)

func TestRunStopsWhenContextIsCanceled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	logger := logging.NewLogger(nil, "sessionrunner", logging.KindService, slog.LevelInfo)
	if err := Run(ctx, Config{ReconcileEvery: time.Millisecond}, logger); err != nil {
		t.Fatalf("run session runner: %v", err)
	}
}
