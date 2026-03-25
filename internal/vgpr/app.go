package vgpr

import (
	"errors"
	"fmt"
	"io"
	"strings"
)

const (
	ExitSuccess = 0
	ExitFailure = 1
	ExitUsage   = 2
)

type App struct {
	stdout  io.Writer
	stderr  io.Writer
	version string
}

func New(stdout io.Writer, stderr io.Writer, version string) *App {
	return &App{
		stdout:  stdout,
		stderr:  stderr,
		version: version,
	}
}

func (app *App) Run(args []string) int {
	invocation, err := parseInvocation(args)
	if err != nil {
		fmt.Fprintf(app.stderr, "error: %s\n", err)
		fmt.Fprint(app.stderr, rootHelp)
		return ExitUsage
	}

	if invocation.help {
		helpText, err := resolveHelp(invocation)
		if err != nil {
			fmt.Fprintf(app.stderr, "error: %s\n", err)
			return ExitUsage
		}
		fmt.Fprint(app.stdout, helpText)
		return ExitSuccess
	}

	if invocation.version {
		fmt.Fprintln(app.stdout, app.version)
		return ExitSuccess
	}

	if err := validateInvocation(invocation); err != nil {
		fmt.Fprintf(app.stderr, "error: %s\n", err)
		fmt.Fprint(app.stderr, rootHelp)
		return ExitUsage
	}

	if len(invocation.commandPath) == 0 {
		fmt.Fprint(app.stdout, rootHelp)
		return ExitSuccess
	}

	fmt.Fprintf(app.stderr, "%s is not implemented yet.\n", commandLabel(invocation.commandPath))
	fmt.Fprintln(app.stderr, "Next step: wire this command to real deployment state in a follow-up slice.")
	return ExitFailure
}

type invocation struct {
	commandPath []string
	help        bool
	version     bool
	positionals []string
}

type flagSpec struct {
	takesValue bool
}

type commandSpec struct {
	group          bool
	positionalsMin int
	positionalsMax int
	flags          map[string]flagSpec
}

var globalFlags = map[string]flagSpec{
	"--deployment": {takesValue: true},
	"--json":       {},
	"--plain":      {},
	"-q":           {},
	"--quiet":      {},
	"-v":           {},
	"--verbose":    {},
	"-f":           {},
	"--force":      {},
	"--no-color":   {},
	"--no-input":   {},
}

var setupFlags = map[string]flagSpec{
	"--name":                 {takesValue: true},
	"--admin-email":          {takesValue: true},
	"--admin-username":       {takesValue: true},
	"--admin-password-file":  {takesValue: true},
	"--admin-password-stdin": {},
	"--open":                 {},
	"--no-open":              {},
	"-n":                     {},
	"--dry-run":              {},
}

var commandSpecs = map[string]commandSpec{
	"setup": {
		group: true,
	},
	"setup local": {
		flags: mergeFlagSpecs(setupFlags, map[string]flagSpec{
			"--profile": {takesValue: true},
		}),
	},
	"setup mock": {
		flags: mergeFlagSpecs(setupFlags, map[string]flagSpec{
			"--region":       {takesValue: true},
			"--size":         {takesValue: true},
			"--dns-provider": {takesValue: true},
		}),
	},
	"setup do": {
		flags: mergeFlagSpecs(setupFlags, map[string]flagSpec{
			"--domain":                {takesValue: true},
			"--dns-provider":          {takesValue: true},
			"--dns-zone":              {takesValue: true},
			"--region":                {takesValue: true},
			"--size":                  {takesValue: true},
			"--turn-mode":             {takesValue: true},
			"--do-token-file":         {takesValue: true},
			"--cloudflare-token-file": {takesValue: true},
		}),
	},
	"open":   {},
	"status": {},
	"doctor": {},
	"update": {
		flags: map[string]flagSpec{
			"-n":        {},
			"--dry-run": {},
		},
	},
	"logs": {
		flags: map[string]flagSpec{
			"--component": {takesValue: true},
			"--since":     {takesValue: true},
			"--follow":    {},
		},
	},
	"backup": {
		group: true,
	},
	"backup create": {},
	"backup list":   {},
	"restore": {
		positionalsMin: 1,
		positionalsMax: 1,
		flags: map[string]flagSpec{
			"--confirm-name": {takesValue: true},
		},
	},
	"destroy": {
		flags: map[string]flagSpec{
			"--confirm-name": {takesValue: true},
		},
	},
}

func parseInvocation(args []string) (invocation, error) {
	var result invocation

	for index := 0; index < len(args); index++ {
		arg := args[index]
		switch arg {
		case "-h", "--help":
			result.help = true
			continue
		case "--version":
			result.version = true
			continue
		case "help":
			if len(result.commandPath) == 0 {
				result.help = true
				continue
			}
		}

		if consumed, nextIndex, err := consumeFlag(arg, args, index, globalFlags, "global", result.help); consumed {
			if err != nil {
				return invocation{}, err
			}
			index = nextIndex
			continue
		}

		if strings.HasPrefix(arg, "-") {
			if len(result.commandPath) == 0 {
				if result.help {
					continue
				}
				return invocation{}, fmt.Errorf("unknown flag %q", arg)
			}

			commandKey := strings.Join(result.commandPath, " ")
			spec, ok := commandSpecs[commandKey]
			if !ok || spec.group {
				if result.help {
					continue
				}
				return invocation{}, fmt.Errorf("unknown flag %q for %q", arg, commandLabel(result.commandPath))
			}

			consumed, nextIndex, err := consumeFlag(arg, args, index, spec.flags, commandLabel(result.commandPath), result.help)
			if err != nil {
				return invocation{}, err
			}
			if consumed {
				index = nextIndex
				continue
			}

			if result.help {
				continue
			}
			return invocation{}, fmt.Errorf("unknown flag %q for %q", arg, commandLabel(result.commandPath))
		}

		nextPath, consumed, err := extendCommandPath(result.commandPath, arg)
		if err != nil {
			return invocation{}, err
		}
		if consumed {
			result.commandPath = nextPath
			continue
		}

		if len(result.commandPath) == 0 || result.help {
			return invocation{}, fmt.Errorf("unknown command path %q", strings.Join(append(append([]string(nil), result.commandPath...), arg), " "))
		}

		result.positionals = append(result.positionals, arg)
	}

	return result, nil
}

func consumeFlag(arg string, args []string, index int, specs map[string]flagSpec, scope string, ignoreValidation bool) (bool, int, error) {
	spec, ok := specs[arg]
	if !ok {
		return false, index, nil
	}
	if !spec.takesValue {
		return true, index, nil
	}
	if index+1 >= len(args) || strings.HasPrefix(args[index+1], "-") {
		if ignoreValidation {
			return true, index, nil
		}
		if scope == "global" {
			return true, index, errors.New("missing value for --deployment")
		}
		return true, index, fmt.Errorf("missing value for %s on %q", arg, scope)
	}
	return true, index + 1, nil
}

func extendCommandPath(commandPath []string, arg string) ([]string, bool, error) {
	candidate := append(append([]string(nil), commandPath...), arg)
	candidateKey := strings.Join(candidate, " ")
	if len(commandPath) == 0 {
		if hasCommandPrefix(candidate) {
			return candidate, true, nil
		}
		return nil, false, fmt.Errorf("unknown command path %q", candidateKey)
	}

	if spec, ok := commandSpecs[strings.Join(commandPath, " ")]; ok && spec.group {
		if hasCommandPrefix(candidate) {
			return candidate, true, nil
		}
		return nil, false, fmt.Errorf("unknown command path %q", candidateKey)
	}

	if hasCommandPrefix(candidate) {
		return candidate, true, nil
	}

	return commandPath, false, nil
}

func hasCommandPrefix(path []string) bool {
	key := strings.Join(path, " ")
	for command := range commandHelp {
		if command == key || strings.HasPrefix(command, key+" ") {
			return true
		}
	}
	return false
}

func validateInvocation(invocation invocation) error {
	if len(invocation.commandPath) == 0 {
		return nil
	}

	key := strings.Join(invocation.commandPath, " ")
	spec, ok := commandSpecs[key]
	if !ok {
		return fmt.Errorf("unknown command path %q", key)
	}
	if spec.group {
		return fmt.Errorf("missing subcommand for %q", commandLabel(invocation.commandPath))
	}
	if len(invocation.positionals) < spec.positionalsMin {
		return fmt.Errorf("missing required argument for %q", commandLabel(invocation.commandPath))
	}
	if spec.positionalsMax >= 0 && len(invocation.positionals) > spec.positionalsMax {
		return fmt.Errorf("unexpected argument %q for %q", invocation.positionals[spec.positionalsMax], commandLabel(invocation.commandPath))
	}
	return nil
}

func resolveHelp(invocation invocation) (string, error) {
	if len(invocation.commandPath) == 0 {
		return rootHelp, nil
	}

	key := strings.Join(invocation.commandPath, " ")
	helpText, ok := commandHelp[key]
	if !ok {
		return "", fmt.Errorf("unknown command path %q", key)
	}
	return helpText, nil
}

func mergeFlagSpecs(groups ...map[string]flagSpec) map[string]flagSpec {
	merged := make(map[string]flagSpec)
	for _, group := range groups {
		for name, spec := range group {
			merged[name] = spec
		}
	}
	return merged
}

func commandLabel(path []string) string {
	if len(path) == 0 {
		return "vgpr"
	}
	return "vgpr " + strings.Join(path, " ")
}

const rootHelp = `vgpr [global flags] <command> [args]

Commands:
  setup <local|mock|do>   Create or bootstrap a deployment
  open                    Open the current deployment in the browser
  status                  Show a compact deployment summary
  doctor                  Run readiness and health checks
  update                  Apply an app update to the current deployment
  logs                    Show deployment logs
  backup create           Create a backup
  backup list             List known backups
  restore <backup-id>     Restore a backup
  destroy                 Tear down a deployment
  help <command>          Show command help

Global flags:
  -h, --help              Show help and ignore other args
  --version               Print CLI version to stdout
  --deployment <name>     Use a named deployment profile instead of the active one
  --json                  Emit stable JSON on stdout
  --plain                 Emit stable line-oriented text on stdout
  -q, --quiet             Suppress non-essential success output
  -v, --verbose           More progress detail on stderr
  -f, --force             Skip confirmations where the command allows it
  --no-color              Disable color
  --no-input              Never prompt; fail if required input is missing
`

var commandHelp = map[string]string{
	"setup": `vgpr setup <local|mock|do>

Create or bootstrap a deployment.

Subcommands:
  local                   Run the full stack locally for trial and development
  mock                    Exercise the remote provisioning flow against a mock provider
  do                      Provision the hosted deployment on DigitalOcean
`,
	"setup local": `vgpr setup local [flags]

Purpose:
  Fastest path to the local stack shape from docs/local-stack.md.

Key flags:
  --name <name>                Deployment profile name; default local
  --profile <core|edge>        Local stack profile; default core
  --admin-email <email>        Initial admin email
  --admin-username <name>      Initial admin username
  --admin-password-file <path> Read the initial admin password from file
  --admin-password-stdin       Read the initial admin password from stdin
  --open / --no-open           Force or suppress browser open
  -n, --dry-run                Show what would be created without changing anything
`,
	"setup mock": `vgpr setup mock [flags]

Purpose:
  Prove the remote-shape install and ops flow without talking to a real provider.
`,
	"setup do": `vgpr setup do [flags]

Purpose:
  Provision the real hosted deployment.
`,
	"open": `vgpr open

Open the current deployment in the browser.
`,
	"status": `vgpr status

Show deployment health, version, and update availability.
`,
	"doctor": `vgpr doctor

Run deployment readiness and health checks.
`,
	"update": `vgpr update

Apply an app update to the current deployment.
`,
	"logs": `vgpr logs [flags]

Show deployment logs.
`,
	"backup": `vgpr backup <create|list>

Manage deployment backups.
`,
	"backup create": `vgpr backup create

Create a backup.
`,
	"backup list": `vgpr backup list

List known backups.
`,
	"restore": `vgpr restore <backup-id>

Restore a backup onto the selected deployment.
`,
	"destroy": `vgpr destroy

Tear down the selected deployment.
`,
}
