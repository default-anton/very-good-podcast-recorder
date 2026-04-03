package sessiondmigrations

import "embed"

// Files embeds the sessiond SQLite migrations.
//
//go:embed *.sql
var Files embed.FS
