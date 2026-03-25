package logging

import (
	"io"
	"log/slog"
	"os"
)

type Kind string

const (
	KindService Kind = "service"
	KindCLI     Kind = "cli"
	KindHarness Kind = "harness"
)

func NewLogger(writer io.Writer, component string, kind Kind, level slog.Leveler) *slog.Logger {
	if writer == nil {
		writer = os.Stderr
	}
	if level == nil {
		level = slog.LevelInfo
	}

	handler := slog.NewJSONHandler(writer, &slog.HandlerOptions{Level: level})
	return slog.New(handler).With(
		slog.String("component", component),
		slog.String("log_kind", string(kind)),
	)
}

func SessionID(id string) slog.Attr {
	return slog.String("session_id", id)
}

func ParticipantID(id string) slog.Attr {
	return slog.String("participant_id", id)
}

func TrackID(id string) slog.Attr {
	return slog.String("track_id", id)
}

func ChunkID(id string) slog.Attr {
	return slog.String("chunk_id", id)
}

func Role(name string) slog.Attr {
	return slog.String("role", name)
}

func Command(name string) slog.Attr {
	return slog.String("command", name)
}

func Scenario(name string) slog.Attr {
	return slog.String("scenario", name)
}
