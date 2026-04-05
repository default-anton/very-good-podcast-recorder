package sessiond

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
)

func (s *store) pruneStaleArtifactFiles(tracks []recordingTrackRow, chunksByTrack map[string][]trackChunkRow) error {
	expectedSeatFiles, err := expectedSeatArtifactFiles(tracks, chunksByTrack)
	if err != nil {
		return err
	}

	seatsRoot, err := artifactPathOnDisk(s.config.ArtifactRoot, "seats")
	if err != nil {
		return err
	}

	cleanupPlan, err := staleSeatArtifactCleanupPlan(s.config.ArtifactRoot, seatsRoot, expectedSeatFiles)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}

	for _, staleFile := range cleanupPlan.files {
		if err := os.Remove(staleFile); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("remove stale artifact file %s: %w", staleFile, err)
		}
	}
	for _, dir := range cleanupPlan.dirs {
		if err := removeEmptyDirectory(dir); err != nil {
			return err
		}
	}

	return nil
}

func expectedSeatArtifactFiles(tracks []recordingTrackRow, chunksByTrack map[string][]trackChunkRow) (map[string]struct{}, error) {
	expected := make(map[string]struct{})
	for _, track := range tracks {
		trackDirRelative, err := trackRelativeDir(track)
		if err != nil {
			return nil, err
		}

		trackManifestRelative, err := cleanArtifactRelativePath(path.Join(trackDirRelative, "track.json"))
		if err != nil {
			return nil, err
		}
		expected[trackManifestRelative] = struct{}{}

		for _, chunk := range chunksByTrack[track.ID] {
			chunkRelative, err := cleanArtifactRelativePath(chunk.StoragePath)
			if err != nil {
				return nil, fmt.Errorf("validate chunk artifact path for track %s chunk %d: %w", track.ID, chunk.ChunkIndex, err)
			}
			expected[chunkRelative] = struct{}{}
		}
	}

	return expected, nil
}

type seatArtifactCleanupPlan struct {
	files []string
	dirs  []string
}

func staleSeatArtifactCleanupPlan(artifactRoot string, seatsRoot string, expectedFiles map[string]struct{}) (seatArtifactCleanupPlan, error) {
	cleanArtifactRoot := filepath.Clean(artifactRoot)
	plan := seatArtifactCleanupPlan{}
	if err := filepath.WalkDir(seatsRoot, func(currentPath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if currentPath == seatsRoot {
			plan.dirs = append(plan.dirs, currentPath)
			return nil
		}
		if entry.IsDir() {
			plan.dirs = append(plan.dirs, currentPath)
			return nil
		}

		relativeToRoot, err := filepath.Rel(cleanArtifactRoot, currentPath)
		if err != nil {
			return fmt.Errorf("resolve artifact path %s: %w", currentPath, err)
		}
		cleanRelativePath, err := cleanArtifactRelativePath(relativeToRoot)
		if err != nil {
			return fmt.Errorf("normalize artifact path %s: %w", currentPath, err)
		}
		if _, ok := expectedFiles[cleanRelativePath]; ok {
			return nil
		}

		plan.files = append(plan.files, currentPath)
		return nil
	}); err != nil {
		return seatArtifactCleanupPlan{}, err
	}

	sort.Slice(plan.dirs, func(left int, right int) bool {
		return len(plan.dirs[left]) > len(plan.dirs[right])
	})
	return plan, nil
}

func removeEmptyDirectory(path string) error {
	entries, err := os.ReadDir(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read artifact directory %s: %w", path, err)
	}
	if len(entries) != 0 {
		return nil
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove empty artifact directory %s: %w", path, err)
	}
	return nil
}
