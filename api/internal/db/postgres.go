package db

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func Open(ctx context.Context, dsn, migrationsDir string) (*sql.DB, error) {
	database, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	if err = database.PingContext(ctx); err != nil {
		database.Close()
		return nil, fmt.Errorf("connect postgres: %w", err)
	}
	if err = migrate(ctx, database, migrationsDir); err != nil {
		database.Close()
		return nil, err
	}
	return database, nil
}

func migrate(ctx context.Context, database *sql.DB, dir string) error {
	if _, err := database.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`); err != nil {
		return fmt.Errorf("prepare migration ledger: %w", err)
	}
	files, err := filepath.Glob(filepath.Join(dir, "*.sql"))
	if err != nil {
		return fmt.Errorf("find migrations: %w", err)
	}
	sort.Strings(files)
	for _, file := range files {
		name := filepath.Base(file)
		var applied bool
		if err = database.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=$1)`, name).Scan(&applied); err != nil {
			return err
		}
		if applied {
			continue
		}
		body, readErr := os.ReadFile(file)
		if readErr != nil {
			return fmt.Errorf("read migration %s: %w", name, readErr)
		}
		tx, txErr := database.BeginTx(ctx, nil)
		if txErr != nil {
			return txErr
		}
		if _, txErr = tx.ExecContext(ctx, string(body)); txErr == nil {
			_, txErr = tx.ExecContext(ctx, `INSERT INTO schema_migrations(name) VALUES($1)`, name)
		}
		if txErr != nil {
			tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", name, txErr)
		}
		if txErr = tx.Commit(); txErr != nil {
			return txErr
		}
	}
	return nil
}
