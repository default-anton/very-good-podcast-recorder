package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/default-anton/very-good-podcast-recorder/internal/controlplane"
	"github.com/default-anton/very-good-podcast-recorder/internal/logging"
)

var version = "dev"

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	flags := flag.NewFlagSet("controlplane", flag.ExitOnError)
	addr := flags.String("addr", controlplane.DefaultAddr, "Control-plane listen address")
	flags.Parse(os.Args[1:])

	logger := logging.NewLogger(os.Stderr, "controlplane", logging.KindService, slog.LevelInfo)
	if err := controlplane.Run(ctx, controlplane.Config{Addr: *addr, Version: version}, logger); err != nil {
		logger.Error("control plane failed", slog.Any("error", err))
		os.Exit(1)
	}
}
