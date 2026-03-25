package main

import (
	"os"

	"github.com/default-anton/very-good-podcast-recorder/internal/vgpr"
)

var version = "dev"

func main() {
	app := vgpr.New(os.Stdout, os.Stderr, version)
	os.Exit(app.Run(os.Args[1:]))
}
