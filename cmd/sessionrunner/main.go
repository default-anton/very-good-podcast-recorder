package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/default-anton/very-good-podcast-recorder/internal/logging"
	"github.com/default-anton/very-good-podcast-recorder/internal/provisioning"
)

var version = "dev"

func main() {
	_ = version

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	flags := flag.NewFlagSet("sessionrunner", flag.ExitOnError)
	reconcileEvery := flags.Duration("reconcile-every", provisioning.DefaultReconcileEvery, "Reconcile interval")
	flags.Parse(os.Args[1:])

	logger := logging.NewLogger(os.Stderr, "sessionrunner", logging.KindService, slog.LevelInfo)
	logger.Info("starting session runner", slog.Duration("reconcile_every", *reconcileEvery))

	if err := provisioning.Run(ctx, provisioning.Config{ReconcileEvery: *reconcileEvery}, logger); err != nil {
		logger.Error("session runner failed", slog.Any("error", err))
		os.Exit(1)
	}
}
