package provisioning

import (
	"context"
	"log/slog"
	"time"
)

const DefaultReconcileEvery = 30 * time.Second

type Config struct {
	ReconcileEvery time.Duration
}

func Run(ctx context.Context, cfg Config, logger *slog.Logger) error {
	interval := cfg.ReconcileEvery
	if interval <= 0 {
		interval = DefaultReconcileEvery
	}

	logger.Info("session runner started", slog.Duration("reconcile_every", interval))
	defer logger.Info("session runner stopped")

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			logger.Info("reconcile tick", slog.Duration("reconcile_every", interval))
		}
	}
}
