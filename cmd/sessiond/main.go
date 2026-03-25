package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/default-anton/very-good-podcast-recorder/internal/logging"
	"github.com/default-anton/very-good-podcast-recorder/internal/sessions"
)

var version = "dev"

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	flags := flag.NewFlagSet("sessiond", flag.ExitOnError)
	addr := flags.String("addr", sessions.DefaultAddr, "Sessiond listen address")
	flags.Parse(os.Args[1:])

	logger := logging.NewLogger(os.Stderr, "sessiond", logging.KindService, slog.LevelInfo)
	if err := sessions.Run(ctx, sessions.Config{Addr: *addr, Version: version}, logger); err != nil {
		logger.Error("sessiond failed", slog.Any("error", err))
		os.Exit(1)
	}
}
