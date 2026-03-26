package vgpr

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

type rootFlags struct {
	Deployment string
	Version    bool
	JSON       bool
	Plain      bool
	Quiet      bool
	Verbose    bool
	Force      bool
	NoColor    bool
	NoInput    bool
}

func (app *App) newRootCommand() *cobra.Command {
	flags := &rootFlags{}

	cobra.EnableCommandSorting = false

	root := &cobra.Command{
		Use:           "vgpr",
		Short:         "Operate a very-good-podcast-recorder deployment",
		Long:          "Operate a very-good-podcast-recorder deployment from the operator's laptop.",
		Example:       trimExamples(rootExamples),
		SilenceErrors: true,
		SilenceUsage:  true,
		PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
			return app.loadRuntimeConfig(cmd, flags)
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
		CompletionOptions: cobra.CompletionOptions{DisableDefaultCmd: true},
	}
	root.SetOut(app.stdout)
	root.SetErr(app.stderr)

	persistentFlags := root.PersistentFlags()
	persistentFlags.StringVar(&flags.Deployment, "deployment", "", "Use a named deployment profile instead of the active one")
	persistentFlags.BoolVar(&flags.Version, "version", false, "Print CLI version to stdout")
	persistentFlags.BoolVar(&flags.JSON, "json", false, "Emit stable JSON on stdout")
	persistentFlags.BoolVar(&flags.Plain, "plain", false, "Emit stable line-oriented text on stdout")
	persistentFlags.BoolVarP(&flags.Quiet, "quiet", "q", false, "Suppress non-essential success output")
	persistentFlags.BoolVarP(&flags.Verbose, "verbose", "v", false, "More progress detail on stderr")
	persistentFlags.BoolVarP(&flags.Force, "force", "f", false, "Skip confirmations where the command allows it")
	persistentFlags.BoolVar(&flags.NoColor, "no-color", false, "Disable color")
	persistentFlags.BoolVar(&flags.NoInput, "no-input", false, "Never prompt; fail if required input is missing")
	mustMarkFlagsMutuallyExclusive(root, "json", "plain")

	root.AddCommand(
		newSetupCommand(),
		newOpenCommand(),
		newStatusCommand(),
		newDoctorCommand(),
		newUpdateCommand(),
		newLogsCommand(),
		newBackupCommand(),
		newRestoreCommand(),
		newDestroyCommand(),
	)

	return root
}

func (app *App) loadRuntimeConfig(cmd *cobra.Command, flags *rootFlags) error {
	if isHelpCommand(cmd) {
		return nil
	}
	if flags.Version {
		fmt.Fprintln(cmd.OutOrStdout(), app.version)
		return errVersionRequested
	}

	cfg, err := loadBootstrapConfig(app.lookupEnv, app.userHomeDir)
	if err != nil {
		return err
	}

	applyBootstrapDefaults(cmd, flags, cfg)
	return nil
}

func applyBootstrapDefaults(cmd *cobra.Command, flags *rootFlags, cfg bootstrapConfig) {
	if !cmd.Flags().Changed("deployment") {
		flags.Deployment = cfg.Deployment
	}
	if !cmd.Flags().Changed("json") && !cmd.Flags().Changed("plain") {
		switch cfg.Output {
		case "json":
			flags.JSON = true
		case "plain":
			flags.Plain = true
		}
	}
}

func isHelpCommand(cmd *cobra.Command) bool {
	return cmd != nil && cmd.Name() == "help"
}

func mustMarkFlagsMutuallyExclusive(cmd *cobra.Command, names ...string) {
	cmd.MarkFlagsMutuallyExclusive(names...)
}

func newSetupCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "setup",
		Short: "Create or bootstrap a deployment",
		Long:  "Create or bootstrap a deployment.",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return fmt.Errorf("missing subcommand for %q", cmd.CommandPath())
		},
	}
	cmd.AddCommand(newSetupLocalCommand(), newSetupMockCommand(), newSetupDOCommand())
	return cmd
}

func newSetupLocalCommand() *cobra.Command {
	cmd := newStubCommand(
		"local",
		"Run the full stack locally for trial and development",
		"Fastest path to the local stack shape from docs/local-stack.md.",
		cobra.NoArgs,
	)
	addSetupCommonFlags(cmd)
	cmd.Flags().String("profile", "", "Local stack profile")
	return cmd
}

func newSetupMockCommand() *cobra.Command {
	cmd := newStubCommand(
		"mock",
		"Exercise the remote provisioning flow against a mock provider",
		"Prove the remote-shape install and ops flow without talking to a real provider.",
		cobra.NoArgs,
	)
	addSetupCommonFlags(cmd)
	cmd.Flags().String("region", "", "Mock region name")
	cmd.Flags().String("size", "", "Mock machine preset")
	cmd.Flags().String("dns-provider", "", "DNS provider")
	return cmd
}

func newSetupDOCommand() *cobra.Command {
	cmd := newStubCommand(
		"do",
		"Provision the hosted deployment on DigitalOcean",
		"Provision the real hosted deployment.",
		cobra.NoArgs,
	)
	addSetupCommonFlags(cmd)
	cmd.Flags().String("domain", "", "Public control-plane hostname")
	cmd.Flags().String("dns-provider", "", "DNS provider")
	cmd.Flags().String("dns-zone", "", "DNS zone")
	cmd.Flags().String("region", "", "DigitalOcean region")
	cmd.Flags().String("size", "", "VM size preset")
	cmd.Flags().String("turn-mode", "", "TURN placement")
	cmd.Flags().String("do-token-file", "", "Read the DigitalOcean API token from file")
	cmd.Flags().String("cloudflare-token-file", "", "Read the Cloudflare API token from file")
	return cmd
}

func addSetupCommonFlags(cmd *cobra.Command) {
	flags := cmd.Flags()
	flags.String("name", "", "Deployment profile name")
	flags.String("admin-email", "", "Initial admin email")
	flags.String("admin-username", "", "Initial admin username")
	flags.String("admin-password-file", "", "Read the initial admin password from file")
	flags.Bool("admin-password-stdin", false, "Read the initial admin password from stdin")
	flags.Bool("open", false, "Open the browser after setup")
	flags.Bool("no-open", false, "Suppress browser open after setup")
	flags.BoolP("dry-run", "n", false, "Show what would be created without changing anything")
	mustMarkFlagsMutuallyExclusive(cmd, "admin-password-file", "admin-password-stdin")
	mustMarkFlagsMutuallyExclusive(cmd, "open", "no-open")
}

func newOpenCommand() *cobra.Command {
	return newStubCommand(
		"open",
		"Open the current deployment in the browser",
		"Open the current deployment in the browser.",
		cobra.NoArgs,
	)
}

func newStatusCommand() *cobra.Command {
	return newStubCommand(
		"status",
		"Show a compact deployment summary",
		"Show deployment health, version, and update availability.",
		cobra.NoArgs,
	)
}

func newDoctorCommand() *cobra.Command {
	return newStubCommand(
		"doctor",
		"Run readiness and health checks",
		"Run deployment readiness and health checks.",
		cobra.NoArgs,
	)
}

func newUpdateCommand() *cobra.Command {
	cmd := newStubCommand(
		"update",
		"Apply an app update to the current deployment",
		"Apply an app update to the current deployment.",
		cobra.NoArgs,
	)
	cmd.Flags().BoolP("dry-run", "n", false, "Show what would change without applying it")
	return cmd
}

func newLogsCommand() *cobra.Command {
	cmd := newStubCommand(
		"logs",
		"Show deployment logs",
		"Show deployment logs.",
		cobra.NoArgs,
	)
	cmd.Flags().String("component", "", "Select a component")
	cmd.Flags().String("since", "", "Select a time range")
	cmd.Flags().Bool("follow", false, "Follow logs")
	return cmd
}

func newBackupCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "backup",
		Short: "Manage deployment backups",
		Long:  "Manage deployment backups.",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return fmt.Errorf("missing subcommand for %q", cmd.CommandPath())
		},
	}
	cmd.AddCommand(
		newStubCommand("create", "Create a backup", "Create a backup.", cobra.NoArgs),
		newStubCommand("list", "List known backups", "List known backups.", cobra.NoArgs),
	)
	return cmd
}

func newRestoreCommand() *cobra.Command {
	cmd := newStubCommand(
		"restore BACKUP_ID",
		"Restore a backup",
		"Restore a backup onto the selected deployment.",
		cobra.ExactArgs(1),
	)
	cmd.Flags().String("confirm-name", "", "Require the deployment name for confirmation")
	return cmd
}

func newDestroyCommand() *cobra.Command {
	cmd := newStubCommand(
		"destroy",
		"Tear down a deployment",
		"Tear down the selected deployment.",
		cobra.NoArgs,
	)
	cmd.Flags().String("confirm-name", "", "Require the deployment name for confirmation")
	return cmd
}

func newStubCommand(use string, short string, long string, args cobra.PositionalArgs) *cobra.Command {
	return &cobra.Command{
		Use:   use,
		Short: short,
		Long:  long,
		Args:  args,
		RunE: func(cmd *cobra.Command, args []string) error {
			return &unimplementedError{command: cmd.CommandPath()}
		},
	}
}

func trimExamples(text string) string {
	return strings.TrimSpace(text)
}

const rootExamples = `
  vgpr setup local
  vgpr setup mock --name demo
  vgpr setup do --name prod --domain app.example.com --dns-provider cloudflare
  vgpr status
  vgpr doctor
  vgpr logs --component controlplane --follow
`
