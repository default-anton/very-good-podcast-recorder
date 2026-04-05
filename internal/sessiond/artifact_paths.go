package sessiond

import (
	"encoding/json"
	"fmt"
	"mime"
	"os"
	"path"
	"path/filepath"
	"strings"
)

func trackRelativeDir(track recordingTrackRow) (string, error) {
	return trackRelativeDirValues(track.ParticipantSeatID, track.Source, track.SourceInstanceID, track.SegmentIndex)
}

func trackRelativeDirForSummary(track manifestTrackSummaryRow) (string, error) {
	return trackRelativeDirValues(track.ParticipantSeatID, track.Source, track.SourceInstanceID, track.SegmentIndex)
}

func trackRelativeDirValues(participantSeatID string, source string, sourceInstanceID string, segmentIndex int) (string, error) {
	if err := validateArtifactPathComponent("participant_seat_id", participantSeatID); err != nil {
		return "", fmt.Errorf("build track artifact path: %w", err)
	}
	if err := validateArtifactPathComponent("source", source); err != nil {
		return "", fmt.Errorf("build track artifact path: %w", err)
	}
	if err := validateArtifactPathComponent("source_instance_id", sourceInstanceID); err != nil {
		return "", fmt.Errorf("build track artifact path: %w", err)
	}

	return path.Join(
		"seats",
		participantSeatID,
		source,
		sourceInstanceID,
		fmt.Sprintf("segment-%04d", segmentIndex),
	), nil
}

func chunkStoragePath(track recordingTrackRow, chunkIndex int) (string, error) {
	extension, err := chunkFileExtension(track.MimeType)
	if err != nil {
		return "", err
	}

	trackDirRelative, err := trackRelativeDir(track)
	if err != nil {
		return "", err
	}
	return path.Join(trackDirRelative, fmt.Sprintf("chunk-%06d%s", chunkIndex, extension)), nil
}

func chunkFileExtension(rawMimeType string) (string, error) {
	mediaType, _, err := mime.ParseMediaType(strings.TrimSpace(rawMimeType))
	if err != nil {
		return "", requestBadRequest("invalid_request", fmt.Sprintf("mime_type must be a valid media type: %v", err))
	}
	switch mediaType {
	case "audio/webm", "video/webm":
		return ".webm", nil
	default:
		return "", requestBadRequest("invalid_request", fmt.Sprintf("mime_type %q is not supported for chunk persistence", rawMimeType))
	}
}

func writeChunkFile(path string, chunkBytes []byte) error {
	dir := filepath.Dir(path)
	tempFile, err := os.CreateTemp(dir, ".chunk-*")
	if err != nil {
		return err
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath)

	if _, err := tempFile.Write(chunkBytes); err != nil {
		tempFile.Close()
		return err
	}
	if err := tempFile.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tempPath, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tempPath, path); err != nil {
		return err
	}
	return nil
}

func writeJSONFile(path string, payload any) error {
	dir := filepath.Dir(path)
	if err := ensurePrivateDirectory(dir); err != nil {
		return fmt.Errorf("prepare directory %s: %w", dir, err)
	}

	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("encode json file %s: %w", path, err)
	}
	encoded = append(encoded, '\n')

	tempFile, err := os.CreateTemp(dir, ".tmp-*.json")
	if err != nil {
		return fmt.Errorf("create temp json file in %s: %w", dir, err)
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath)

	if _, err := tempFile.Write(encoded); err != nil {
		tempFile.Close()
		return fmt.Errorf("write temp json file %s: %w", tempPath, err)
	}
	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("close temp json file %s: %w", tempPath, err)
	}
	if err := os.Chmod(tempPath, 0o600); err != nil {
		return fmt.Errorf("chmod temp json file %s: %w", tempPath, err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("replace json file %s: %w", path, err)
	}

	return nil
}

func validateArtifactPathComponent(field string, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", field)
	}
	if value == "." || value == ".." {
		return fmt.Errorf("%s must not be . or ..", field)
	}
	if strings.ContainsAny(value, `/\\`) {
		return fmt.Errorf("%s must not contain path separators", field)
	}

	return nil
}

func cleanArtifactRelativePath(relativePath string) (string, error) {
	cleanRelativePath := filepath.Clean(filepath.FromSlash(relativePath))
	if cleanRelativePath == "." {
		return "", fmt.Errorf("artifact path %q must not be empty", relativePath)
	}
	if filepath.IsAbs(cleanRelativePath) {
		return "", fmt.Errorf("artifact path %q must be relative", relativePath)
	}
	if cleanRelativePath == ".." || strings.HasPrefix(cleanRelativePath, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("artifact path %q escapes artifact root", relativePath)
	}

	return cleanRelativePath, nil
}

func artifactPathOnDisk(root string, relativePath string) (string, error) {
	cleanRoot := filepath.Clean(root)
	cleanRelativePath, err := cleanArtifactRelativePath(relativePath)
	if err != nil {
		return "", err
	}

	fullPath := filepath.Join(cleanRoot, cleanRelativePath)
	relativeToRoot, err := filepath.Rel(cleanRoot, fullPath)
	if err != nil {
		return "", fmt.Errorf("resolve artifact path %q: %w", relativePath, err)
	}
	if relativeToRoot == ".." || strings.HasPrefix(relativeToRoot, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("artifact path %q escapes artifact root", relativePath)
	}

	return fullPath, nil
}
