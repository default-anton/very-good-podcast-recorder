package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/default-anton/very-good-podcast-recorder/internal/sessiond"
)

var buildVersion = "dev"

func main() {
	if wantsHelp(os.Args[1:]) {
		fmt.Fprint(os.Stdout, usage())
		return
	}
	if wantsVersion(os.Args[1:]) {
		fmt.Fprintln(os.Stdout, buildVersion)
		return
	}

	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))

	if err := run(context.Background(), logger, os.Args[1:], os.LookupEnv); err != nil {
		logger.Error("sessiond exited", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

func usage() string {
	return `sessiond serves the disposable VGPR session backend.

Usage:
  sessiond [flags]

Flags:
  -config <path>           path to the sessiond YAML config
  -listen-addr <addr>      HTTP listen address for sessiond
  -session-id <id>         session id this process serves
  -release-version <ver>   release version reported by health endpoints
  -artifact-root <path>    artifact root for this session
  -sqlite-path <path>      SQLite path for this session
  -h, --help               show this help text
  --version                print the sessiond version

Config precedence:
  flags > env > config file > defaults

Environment:
  SESSIOND_CONFIG
  SESSIOND_LISTEN_ADDR
  SESSIOND_SESSION_ID
  SESSIOND_RELEASE_VERSION
  SESSIOND_ARTIFACT_ROOT
  SESSIOND_SQLITE_PATH

The config file must currently provide:
  livekit.api_key
  livekit.api_secret
  bootstrap.host_join_key
  bootstrap.guest_join_key
  bootstrap.seats
`
}

func wantsHelp(args []string) bool {
	for _, arg := range args {
		if arg == "-h" || arg == "--help" {
			return true
		}
	}

	return false
}

func wantsVersion(args []string) bool {
	for _, arg := range args {
		if arg == "--version" {
			return true
		}
	}

	return false
}

func run(
	ctx context.Context,
	logger *slog.Logger,
	args []string,
	lookupEnv func(string) (string, bool),
) error {
	cfg, err := sessiond.LoadConfig(args, lookupEnv)
	if err != nil {
		return err
	}

	if cfg.ReleaseVersion == "dev" && buildVersion != "" {
		cfg.ReleaseVersion = buildVersion
	}

	if err := sessiond.PrepareRuntime(cfg); err != nil {
		return err
	}

	server, err := sessiond.NewServer(cfg)
	if err != nil {
		return err
	}
	defer func() {
		if err := server.Close(); err != nil {
			logger.Error("close sessiond store", slog.String("error", err.Error()))
		}
	}()
	if err := server.Initialize(ctx); err != nil {
		return err
	}

	httpServer := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           server.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	listener, err := net.Listen("tcp", cfg.ListenAddr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", cfg.ListenAddr, err)
	}
	defer listener.Close()

	runContext, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		logger.Info(
			"sessiond listening",
			slog.String("listen_addr", listener.Addr().String()),
			slog.String("session_id", cfg.SessionID),
			slog.String("artifact_root", cfg.ArtifactRoot),
			slog.String("sqlite_path", cfg.SQLitePath),
			slog.String("release_version", cfg.ReleaseVersion),
		)

		if err := httpServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- fmt.Errorf("serve on %s: %w", listener.Addr().String(), err)
			return
		}

		errCh <- nil
	}()

	select {
	case err := <-errCh:
		return err
	case <-runContext.Done():
		logger.Info("sessiond shutting down", slog.String("reason", runContext.Err().Error()))
	}

	shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(shutdownContext); err != nil {
		return fmt.Errorf("shutdown sessiond: %w", err)
	}

	if err := <-errCh; err != nil {
		return err
	}

	return nil
}
