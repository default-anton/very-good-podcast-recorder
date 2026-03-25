package controlplane

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"
)

const DefaultAddr = "127.0.0.1:8080"

type Config struct {
	Addr    string
	Version string
}

type statusResponse struct {
	Service string `json:"service"`
	Status  string `json:"status"`
	Version string `json:"version"`
}

func NewHandler(version string, logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /{$}", func(writer http.ResponseWriter, request *http.Request) {
		respondJSON(writer, http.StatusOK, statusResponse{
			Service: "controlplane",
			Status:  "bootstrap",
			Version: version,
		})
	})

	mux.HandleFunc("GET /healthz", func(writer http.ResponseWriter, request *http.Request) {
		respondJSON(writer, http.StatusOK, statusResponse{
			Service: "controlplane",
			Status:  "ok",
			Version: version,
		})
	})

	mux.HandleFunc("GET /readyz", func(writer http.ResponseWriter, request *http.Request) {
		respondJSON(writer, http.StatusOK, statusResponse{
			Service: "controlplane",
			Status:  "ready",
			Version: version,
		})
	})

	return requestLoggingMiddleware(logger, mux)
}

func Run(ctx context.Context, cfg Config, logger *slog.Logger) error {
	addr := cfg.Addr
	if addr == "" {
		addr = DefaultAddr
	}

	server := &http.Server{
		Addr:              addr,
		Handler:           NewHandler(cfg.Version, logger),
		ReadHeaderTimeout: 5 * time.Second,
	}

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen control plane: %w", err)
	}
	boundAddr := listener.Addr().String()

	shutdownDone := make(chan error, 1)
	go func() {
		<-ctx.Done()

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		shutdownDone <- server.Shutdown(shutdownCtx)
	}()

	logger.Info("control plane listening", slog.String("addr", boundAddr))
	err = server.Serve(listener)
	if err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("serve control plane: %w", err)
	}

	if err := <-shutdownDone; err != nil {
		return fmt.Errorf("shutdown control plane: %w", err)
	}

	logger.Info("control plane stopped", slog.String("addr", boundAddr))
	return nil
}

func requestLoggingMiddleware(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		logger.Info(
			"http request",
			slog.String("method", request.Method),
			slog.String("path", request.URL.Path),
		)
		next.ServeHTTP(writer, request)
	})
}

func respondJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}
