package sessiond

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
)

type Server struct {
	config  Config
	mux     *http.ServeMux
	storeMu sync.Mutex
	store   *store
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
	s.mux.HandleFunc("POST /api/v1/join/seat-picker", s.handleSeatPicker)
	s.mux.HandleFunc("POST /api/v1/seat-claims/claim", s.handleClaimSeat)
	s.mux.HandleFunc("POST /api/v1/seat-claims/reclaim", s.handleReclaimSeat)
	s.mux.HandleFunc("GET /api/v1/session", s.handleSessionSnapshot)
	s.mux.HandleFunc("POST /api/v1/session-recording/start", s.handleStartRecording)
	s.mux.HandleFunc("POST /api/v1/session-recording/clock-sync", s.handleClockSync)
	s.mux.HandleFunc("POST /api/v1/session-recording/stop", s.handleStopRecording)
	s.mux.HandleFunc("POST /api/v1/recording-tracks/start", s.handleStartTrack)
	s.mux.HandleFunc("PUT /api/v1/recording-tracks/{recording_track_id}/chunks/{chunk_index}", s.handleUploadChunk)
	s.mux.HandleFunc("POST /api/v1/recording-tracks/{recording_track_id}/finish", s.handleFinishTrack)
}

func (s *Server) Close() error {
	s.storeMu.Lock()
	defer s.storeMu.Unlock()
	if s.store == nil {
		return nil
	}
	return s.store.close()
}

func (s *Server) Initialize(ctx context.Context) error {
	store, err := s.ensureStore(ctx)
	if err != nil {
		return err
	}
	if err := store.ensureSQLiteWritable(ctx); err != nil {
		return err
	}

	return nil
}

func (s *Server) ensureStore(ctx context.Context) (*store, error) {
	s.storeMu.Lock()
	defer s.storeMu.Unlock()
	if s.store != nil {
		return s.store, nil
	}

	store, err := openStore(ctx, s.config)
	if err != nil {
		return nil, err
	}
	s.store = store

	return store, nil
}

type requestError struct {
	StatusCode int
	Code       string
	Message    string
}

func (err *requestError) Error() string {
	return err.Message
}

func requestBadRequest(code string, message string) error {
	return &requestError{StatusCode: http.StatusBadRequest, Code: code, Message: message}
}

func requestUnauthorized(code string, message string) error {
	return &requestError{StatusCode: http.StatusUnauthorized, Code: code, Message: message}
}

func requestForbidden(code string, message string) error {
	return &requestError{StatusCode: http.StatusForbidden, Code: code, Message: message}
}

func requestNotFound(code string, message string) error {
	return &requestError{StatusCode: http.StatusNotFound, Code: code, Message: message}
}

func requestConflict(code string, message string) error {
	return &requestError{StatusCode: http.StatusConflict, Code: code, Message: message}
}

func requestPayloadTooLarge(code string, message string) error {
	return &requestError{StatusCode: http.StatusRequestEntityTooLarge, Code: code, Message: message}
}

func writeRequestError(writer http.ResponseWriter, err error) {
	var requestErr *requestError
	if errors.As(err, &requestErr) {
		writeJSON(writer, requestErr.StatusCode, map[string]any{
			"error": map[string]string{
				"code":    requestErr.Code,
				"message": requestErr.Message,
			},
		})
		return
	}

	writeJSON(writer, http.StatusInternalServerError, map[string]any{
		"error": map[string]string{
			"code":    "internal_error",
			"message": "sessiond hit an unexpected server error",
		},
	})
}

func decodeJSONBody(request *http.Request, dst any) error {
	defer request.Body.Close()

	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return requestBadRequest("invalid_request", fmt.Sprintf("request body must be valid JSON: %v", err))
	}
	if err := decoder.Decode(&struct{}{}); err != nil && !errors.Is(err, io.EOF) {
		return requestBadRequest("invalid_request", "request body must contain exactly one JSON object")
	}

	return nil
}

func claimCookieValue(request *http.Request) string {
	cookie, err := request.Cookie(claimCookieName)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(cookie.Value)
}

func setClaimCookie(writer http.ResponseWriter, request *http.Request, value string) {
	http.SetCookie(writer, &http.Cookie{
		Name:     claimCookieName,
		Value:    value,
		HttpOnly: true,
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
		Secure:   claimCookieRequiresTLS(request),
	})
}

func claimCookieRequiresTLS(request *http.Request) bool {
	if request.TLS != nil {
		return true
	}

	host := request.Host
	if parsedHost, _, err := net.SplitHostPort(host); err == nil {
		host = parsedHost
	}
	if host == "localhost" {
		return false
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		return false
	}

	return true
}
