package sessiond

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestInitializeRebuildsManifestsFromSQLiteState(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	cfg := newTestConfig(tempDir, testSessionID)
	if err := PrepareRuntime(cfg); err != nil {
		t.Fatalf("PrepareRuntime(): %v", err)
	}

	server, err := NewServer(cfg)
	if err != nil {
		t.Fatalf("NewServer(): %v", err)
	}
	if err := server.Initialize(context.Background()); err != nil {
		t.Fatalf("server.Initialize(): %v", err)
	}

	_, hostCookie := claimSeat(t, server, testHostSeat, roleHost, testHostJoinKey, "")
	started := startRecordingForTest(t, server, hostCookie)

	trackID := "trk_restart_rebuild"
	sourceInstanceID := "src_restart_rebuild"
	var startedTrack recordingTrackResponse
	statusCode, _ := callJSON(t, server, "POST", "/api/v1/recording-tracks/start", startTrackRequest{
		RecordingTrackID:       trackID,
		RecordingEpochID:       *started.RecordingEpochID,
		Source:                 "mic",
		SourceInstanceID:       sourceInstanceID,
		Kind:                   "audio",
		SegmentIndex:           0,
		MimeType:               "audio/webm",
		CaptureStartOffsetUS:   1000,
		ClockSyncUncertaintyUS: 50,
	}, hostCookie, &startedTrack)
	if statusCode != 201 {
		t.Fatalf("/recording-tracks/start status = %d, want 201", statusCode)
	}

	firstChunk := []byte("restart-rebuild-zero")
	secondChunk := []byte("restart-rebuild-one")
	uploadChunkForTest(t, server, trackID, 0, "audio/webm", firstChunk, hostCookie)
	uploadChunkForTest(t, server, trackID, 1, "audio/webm", secondChunk, hostCookie)

	var draining recordingSnapshot
	statusCode, _ = callJSON(t, server, "POST", "/api/v1/session-recording/stop", nil, hostCookie, &draining)
	if statusCode != 200 {
		t.Fatalf("/session-recording/stop status = %d, want 200", statusCode)
	}

	var finished finishTrackResponse
	statusCode, _ = callJSON(t, server, "POST", "/api/v1/recording-tracks/"+trackID+"/finish", finishTrackRequest{
		ExpectedChunkCount: 2,
		CaptureEndOffsetUS: 9000,
	}, hostCookie, &finished)
	if statusCode != 200 {
		t.Fatalf("/recording-tracks/%s/finish status = %d, want 200", trackID, statusCode)
	}

	if err := server.Close(); err != nil {
		t.Fatalf("server.Close(): %v", err)
	}

	trackDir, err := trackRelativeDirValues(testHostSeat, "mic", sourceInstanceID, 0)
	if err != nil {
		t.Fatalf("trackRelativeDirValues(): %v", err)
	}
	sessionManifestPath := filepath.Join(cfg.ArtifactRoot, "session.json")
	trackManifestPath := filepath.Join(cfg.ArtifactRoot, filepath.FromSlash(trackDir), "track.json")
	if err := os.Remove(sessionManifestPath); err != nil {
		t.Fatalf("os.Remove(%q): %v", sessionManifestPath, err)
	}
	if err := os.Remove(trackManifestPath); err != nil {
		t.Fatalf("os.Remove(%q): %v", trackManifestPath, err)
	}

	restartedServer, err := NewServer(cfg)
	if err != nil {
		t.Fatalf("NewServer() restart: %v", err)
	}
	if err := restartedServer.Initialize(context.Background()); err != nil {
		t.Fatalf("restartedServer.Initialize(): %v", err)
	}
	defer func() {
		if err := restartedServer.Close(); err != nil {
			t.Fatalf("restartedServer.Close(): %v", err)
		}
	}()

	var sessionFile sessionManifest
	readJSONFile(t, sessionManifestPath, &sessionFile)
	if sessionFile.RecordingState != recordingStateStopped {
		t.Fatalf("rebuilt session.json recording_state = %q, want %q", sessionFile.RecordingState, recordingStateStopped)
	}
	hostSeat := manifestSeatByID(t, sessionFile, testHostSeat)
	if len(hostSeat.Tracks) != 1 {
		t.Fatalf("rebuilt session.json tracks = %d, want 1", len(hostSeat.Tracks))
	}
	if hostSeat.Tracks[0].ArtifactStatus != "complete" {
		t.Fatalf("rebuilt session.json artifact_status = %q, want %q", hostSeat.Tracks[0].ArtifactStatus, "complete")
	}
	if hostSeat.Tracks[0].Path != trackDir {
		t.Fatalf("rebuilt session.json path = %q, want %q", hostSeat.Tracks[0].Path, trackDir)
	}

	var trackFile trackManifest
	readJSONFile(t, trackManifestPath, &trackFile)
	if trackFile.ArtifactStatus != "complete" {
		t.Fatalf("rebuilt track.json artifact_status = %q, want %q", trackFile.ArtifactStatus, "complete")
	}
	if len(trackFile.Chunks) != 2 {
		t.Fatalf("rebuilt track.json chunks = %d, want 2", len(trackFile.Chunks))
	}

	assertChunkFileContents(t, cfg.ArtifactRoot, trackDir, trackFile.Chunks[0].File, firstChunk)
	assertChunkFileContents(t, cfg.ArtifactRoot, trackDir, trackFile.Chunks[1].File, secondChunk)
}

func TestInitializePrunesStaleArtifactsWhenSQLiteStateIsEmpty(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	cfg := newTestConfig(tempDir, testSessionID)
	if err := PrepareRuntime(cfg); err != nil {
		t.Fatalf("PrepareRuntime(): %v", err)
	}

	server, err := NewServer(cfg)
	if err != nil {
		t.Fatalf("NewServer(): %v", err)
	}
	if err := server.Initialize(context.Background()); err != nil {
		t.Fatalf("server.Initialize(): %v", err)
	}

	_, hostCookie := claimSeat(t, server, testHostSeat, roleHost, testHostJoinKey, "")
	recorded := recordCompleteTrackForArtifactTest(t, server, hostCookie, "trk_stale_cleanup", "src_stale_cleanup")
	if err := server.Close(); err != nil {
		t.Fatalf("server.Close(): %v", err)
	}

	sessionManifestPath := filepath.Join(cfg.ArtifactRoot, "session.json")
	trackManifestPath := filepath.Join(cfg.ArtifactRoot, filepath.FromSlash(recorded.TrackDir), "track.json")
	chunkPath := filepath.Join(cfg.ArtifactRoot, filepath.FromSlash(recorded.TrackDir), "chunk-000000.webm")

	freshCfg := newTestConfig(tempDir, testSessionID)
	freshCfg.SQLitePath = filepath.Join(tempDir, "fresh-state", "sessiond.sqlite")
	if err := PrepareRuntime(freshCfg); err != nil {
		t.Fatalf("PrepareRuntime() fresh state: %v", err)
	}

	restartedServer, err := NewServer(freshCfg)
	if err != nil {
		t.Fatalf("NewServer() restart: %v", err)
	}
	if err := restartedServer.Initialize(context.Background()); err != nil {
		t.Fatalf("restartedServer.Initialize(): %v", err)
	}
	defer func() {
		if err := restartedServer.Close(); err != nil {
			t.Fatalf("restartedServer.Close(): %v", err)
		}
	}()

	assertPathMissing(t, sessionManifestPath)
	assertPathMissing(t, trackManifestPath)
	assertPathMissing(t, chunkPath)
	assertPathMissing(t, filepath.Join(cfg.ArtifactRoot, "seats"))
}

func TestInitializePrunesUnexpectedSeatFilesNotReferencedBySQLite(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	cfg := newTestConfig(tempDir, testSessionID)
	if err := PrepareRuntime(cfg); err != nil {
		t.Fatalf("PrepareRuntime(): %v", err)
	}

	server, err := NewServer(cfg)
	if err != nil {
		t.Fatalf("NewServer(): %v", err)
	}
	if err := server.Initialize(context.Background()); err != nil {
		t.Fatalf("server.Initialize(): %v", err)
	}

	_, hostCookie := claimSeat(t, server, testHostSeat, roleHost, testHostJoinKey, "")
	recorded := recordCompleteTrackForArtifactTest(t, server, hostCookie, "trk_orphan_cleanup", "src_orphan_cleanup")
	if err := server.Close(); err != nil {
		t.Fatalf("server.Close(): %v", err)
	}

	trackDirOnDisk := filepath.Join(cfg.ArtifactRoot, filepath.FromSlash(recorded.TrackDir))
	staleChunkPath := filepath.Join(trackDirOnDisk, "chunk-999999.webm")
	if err := os.WriteFile(staleChunkPath, []byte("stale-extra-chunk"), 0o600); err != nil {
		t.Fatalf("os.WriteFile(%q): %v", staleChunkPath, err)
	}

	orphanTrackDir := filepath.Join(cfg.ArtifactRoot, "seats", testHostSeat, "mic", "src_stale_extra", "segment-0000")
	if err := os.MkdirAll(orphanTrackDir, runtimeDirMode); err != nil {
		t.Fatalf("os.MkdirAll(%q): %v", orphanTrackDir, err)
	}
	orphanTrackManifestPath := filepath.Join(orphanTrackDir, "track.json")
	orphanChunkPath := filepath.Join(orphanTrackDir, "chunk-000000.webm")
	if err := os.WriteFile(orphanTrackManifestPath, []byte("{}\n"), 0o600); err != nil {
		t.Fatalf("os.WriteFile(%q): %v", orphanTrackManifestPath, err)
	}
	if err := os.WriteFile(orphanChunkPath, []byte("orphan-chunk"), 0o600); err != nil {
		t.Fatalf("os.WriteFile(%q): %v", orphanChunkPath, err)
	}

	restartedServer, err := NewServer(cfg)
	if err != nil {
		t.Fatalf("NewServer() restart: %v", err)
	}
	if err := restartedServer.Initialize(context.Background()); err != nil {
		t.Fatalf("restartedServer.Initialize(): %v", err)
	}
	defer func() {
		if err := restartedServer.Close(); err != nil {
			t.Fatalf("restartedServer.Close(): %v", err)
		}
	}()

	assertPathMissing(t, staleChunkPath)
	assertPathMissing(t, orphanTrackManifestPath)
	assertPathMissing(t, orphanChunkPath)
	assertPathMissing(t, orphanTrackDir)

	trackManifestPath := filepath.Join(cfg.ArtifactRoot, filepath.FromSlash(recorded.TrackDir), "track.json")
	var trackFile trackManifest
	readJSONFile(t, trackManifestPath, &trackFile)
	if len(trackFile.Chunks) != 2 {
		t.Fatalf("rebuilt track.json chunks = %d, want 2", len(trackFile.Chunks))
	}
	assertChunkFileContents(t, cfg.ArtifactRoot, recorded.TrackDir, "chunk-000000.webm", recorded.FirstChunk)
	assertChunkFileContents(t, cfg.ArtifactRoot, recorded.TrackDir, "chunk-000001.webm", recorded.SecondChunk)
}

func TestArtifactPathOnDiskRejectsEscapes(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if _, err := artifactPathOnDisk(root, "../session.json"); err == nil {
		t.Fatal("artifactPathOnDisk() error = nil, want escape rejection")
	}
	if _, err := artifactPathOnDisk(root, "/abs/path"); err == nil {
		t.Fatal("artifactPathOnDisk() error = nil, want absolute path rejection")
	}
}

type recordedTrackArtifacts struct {
	TrackDir    string
	FirstChunk  []byte
	SecondChunk []byte
}

func recordCompleteTrackForArtifactTest(t *testing.T, server *Server, hostCookie string, trackID string, sourceInstanceID string) recordedTrackArtifacts {
	t.Helper()

	started := startRecordingForTest(t, server, hostCookie)
	var startedTrack recordingTrackResponse
	statusCode, _ := callJSON(t, server, "POST", "/api/v1/recording-tracks/start", startTrackRequest{
		RecordingTrackID:       trackID,
		RecordingEpochID:       *started.RecordingEpochID,
		Source:                 "mic",
		SourceInstanceID:       sourceInstanceID,
		Kind:                   "audio",
		SegmentIndex:           0,
		MimeType:               "audio/webm",
		CaptureStartOffsetUS:   1000,
		ClockSyncUncertaintyUS: 50,
	}, hostCookie, &startedTrack)
	if statusCode != 201 {
		t.Fatalf("/recording-tracks/start status = %d, want 201", statusCode)
	}

	firstChunk := []byte(trackID + "-chunk-zero")
	secondChunk := []byte(trackID + "-chunk-one")
	uploadChunkForTest(t, server, trackID, 0, "audio/webm", firstChunk, hostCookie)
	uploadChunkForTest(t, server, trackID, 1, "audio/webm", secondChunk, hostCookie)

	var draining recordingSnapshot
	statusCode, _ = callJSON(t, server, "POST", "/api/v1/session-recording/stop", nil, hostCookie, &draining)
	if statusCode != 200 {
		t.Fatalf("/session-recording/stop status = %d, want 200", statusCode)
	}

	var finished finishTrackResponse
	statusCode, _ = callJSON(t, server, "POST", "/api/v1/recording-tracks/"+trackID+"/finish", finishTrackRequest{
		ExpectedChunkCount: 2,
		CaptureEndOffsetUS: 9000,
	}, hostCookie, &finished)
	if statusCode != 200 {
		t.Fatalf("/recording-tracks/%s/finish status = %d, want 200", trackID, statusCode)
	}

	trackDir, err := trackRelativeDirValues(testHostSeat, "mic", sourceInstanceID, 0)
	if err != nil {
		t.Fatalf("trackRelativeDirValues(): %v", err)
	}

	return recordedTrackArtifacts{
		TrackDir:    trackDir,
		FirstChunk:  firstChunk,
		SecondChunk: secondChunk,
	}
}

func assertPathMissing(t *testing.T, path string) {
	t.Helper()

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		if err == nil {
			t.Fatalf("os.Stat(%q) error = nil, want not exists", path)
		}
		t.Fatalf("os.Stat(%q) error = %v, want not exists", path, err)
	}
}

func readJSONFile(t *testing.T, path string, dst any) {
	t.Helper()

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("os.ReadFile(%q): %v", path, err)
	}
	if err := json.Unmarshal(raw, dst); err != nil {
		t.Fatalf("json.Unmarshal(%q): %v", path, err)
	}
}
