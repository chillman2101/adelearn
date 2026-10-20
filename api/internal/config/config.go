package config

import "os"

type Config struct {
	Addr      string
	Database  string
	MediaPath string
	MediaURL  string
}

func Load() Config {
	return Config{
		Addr:      env("API_ADDR", "127.0.0.1:8080"),
		Database:  env("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/adelearn?sslmode=disable"),
		MediaPath: env("MEDIA_PATH", "uploads"),
		MediaURL:  env("MEDIA_URL", "http://localhost:8080/media"),
	}
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
