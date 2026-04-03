package sessiond

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
)

type healthChecks struct {
	ConfigLoaded       bool `json:"config_loaded"`
	ArtifactRootExists bool `json:"artifact_root_exists"`
	SQLiteDirExists    bool `json:"sqlite_dir_exists"`
	SnapshotLoaded     bool `json:"snapshot_loaded"`
	SQLiteWritable     bool `json:"sqlite_writable"`
}

type healthResponse struct {
	Status         string       `json:"status"`
	Service        string       `json:"service"`
	SessionID      string       `json:"session_id"`
	ReleaseVersion string       `json:"release_version"`
	ListenAddr     string       `json:"listen_addr"`
	ArtifactRoot   string       `json:"artifact_root"`
	SQLitePath     string       `json:"sqlite_path"`
	Checks         healthChecks `json:"checks"`
}

func (s *Server) handleHealth(writer http.ResponseWriter, request *http.Request) {
	response := s.healthResponse("ok", s.basicHealthChecks())
	writeJSON(writer, http.StatusOK, response)
}

func (s *Server) handleReady(writer http.ResponseWriter, request *http.Request) {
	response := s.readyResponse(request.Context())
	statusCode := http.StatusOK
	if !response.Checks.ready() {
		response.Status = "not_ready"
		statusCode = http.StatusServiceUnavailable
	}

	writeJSON(writer, statusCode, response)
}

func (s *Server) readyResponse(ctx context.Context) healthResponse {
	checks := s.basicHealthChecks()
	if !checks.pathsReady() {
		return s.healthResponse("ready", checks)
	}
	if err := s.Initialize(ctx); err != nil {
		return s.healthResponse("ready", checks)
	}

	checks.SnapshotLoaded = true
	checks.SQLiteWritable = true

	return s.healthResponse("ready", checks)
}

func (s *Server) healthResponse(status string, checks healthChecks) healthResponse {
	return healthResponse{
		Status:         status,
		Service:        "sessiond",
		SessionID:      s.config.SessionID,
		ReleaseVersion: s.config.ReleaseVersion,
		ListenAddr:     s.config.ListenAddr,
		ArtifactRoot:   s.config.ArtifactRoot,
		SQLitePath:     s.config.SQLitePath,
		Checks:         checks,
	}
}

func (s *Server) basicHealthChecks() healthChecks {
	return healthChecks{
		ConfigLoaded:       true,
		ArtifactRootExists: pathExists(s.config.ArtifactRoot),
		SQLiteDirExists:    pathExists(filepath.Dir(s.config.SQLitePath)),
	}
}

func (checks healthChecks) pathsReady() bool {
	return checks.ConfigLoaded && checks.ArtifactRootExists && checks.SQLiteDirExists
}

func (checks healthChecks) ready() bool {
	return checks.pathsReady() && checks.SnapshotLoaded && checks.SQLiteWritable
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func writeJSON(writer http.ResponseWriter, statusCode int, payload any) {
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(statusCode)
	_ = json.NewEncoder(writer).Encode(payload)
}
