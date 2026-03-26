package vgpr

import (
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"
)

const (
	ExitSuccess = 0
	ExitFailure = 1
	ExitUsage   = 2
)

type envLookup func(string) (string, bool)
type homeDirLookup func() (string, error)

type App struct {
	stdout      io.Writer
	stderr      io.Writer
	version     string
	lookupEnv   envLookup
	userHomeDir homeDirLookup
}

func New(stdout io.Writer, stderr io.Writer, version string) *App {
	if stdout == nil {
		stdout = os.Stdout
	}
	if stderr == nil {
		stderr = os.Stderr
	}

	return &App{
		stdout:      stdout,
		stderr:      stderr,
		version:     version,
		lookupEnv:   os.LookupEnv,
		userHomeDir: os.UserHomeDir,
	}
}

func (app *App) Run(args []string) int {
	root := app.newRootCommand()
	root.SetArgs(args)

	if len(args) == 0 {
		if err := root.Help(); err != nil {
			return app.writeUsageError(root, err)
		}
		return ExitSuccess
	}

	cmd, err := root.ExecuteC()
	if err != nil {
		return app.handleExecuteError(cmd, err)
	}

	return ExitSuccess
}

func (app *App) handleExecuteError(cmd *cobra.Command, err error) int {
	if errors.Is(err, errVersionRequested) {
		return ExitSuccess
	}

	var unimplemented *unimplementedError
	if errors.As(err, &unimplemented) {
		fmt.Fprintf(app.stderr, "%s is not implemented yet.\n", unimplemented.command)
		fmt.Fprintln(app.stderr, "Next step: wire this command to real deployment state in a follow-up slice.")
		return ExitFailure
	}

	return app.writeUsageError(cmd, err)
}

func (app *App) writeUsageError(cmd *cobra.Command, err error) int {
	if cmd == nil {
		cmd = app.newRootCommand()
	}

	fmt.Fprintf(app.stderr, "error: %s\n\n", err)
	fmt.Fprint(app.stderr, cmd.UsageString())
	return ExitUsage
}

var errVersionRequested = errors.New("version requested")

type unimplementedError struct {
	command string
}

func (err *unimplementedError) Error() string {
	return err.command
}

var _ error = (*unimplementedError)(nil)
