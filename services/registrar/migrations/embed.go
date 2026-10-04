// Package migrations embeds the SQL migration files (migrations/*.sql).
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
