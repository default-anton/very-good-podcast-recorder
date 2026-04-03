package sessiond

import (
	"fmt"
	"net/http"
)

type Server struct {
	config Config
	mux    *http.ServeMux
}

func NewServer(cfg Config) (*Server, error) {
	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("validate sessiond config: %w", err)
	}

	server := &Server{
		config: cfg,
		mux:    http.NewServeMux(),
	}
	server.registerRoutes()

	return server, nil
}

func (s *Server) Handler() http.Handler {
	return s.mux
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("GET /healthz", s.handleHealth)
	s.mux.HandleFunc("GET /readyz", s.handleReady)
}
