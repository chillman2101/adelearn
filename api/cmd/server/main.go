package main

import (
	"adelearn/api/internal/catalogs"
	"adelearn/api/internal/config"
	"adelearn/api/internal/db"
	"adelearn/api/internal/exams"
	httpapi "adelearn/api/internal/http"
	"adelearn/api/internal/media"
	"adelearn/api/internal/questions"
	"adelearn/api/internal/settings"
	"adelearn/api/internal/students"
	"adelearn/api/internal/teachers"
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	cfg := config.Load()
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	database, err := db.Open(ctx, cfg.Database, "migrations")
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()
	q := &questions.Repository{DB: database}
	e := &exams.Repository{DB: database, Questions: q}
	api := (&httpapi.API{Questions: q, Exams: e, Catalogs: &catalogs.Repository{DB: database}, Settings: &settings.Repository{DB: database}, Students: &students.Repository{DB: database}, Teachers: &teachers.Repository{DB: database}, Media: media.Store{Dir: cfg.MediaPath, BaseURL: cfg.MediaURL}}).Handler()
	server := &http.Server{Addr: cfg.Addr, Handler: api, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		log.Printf("API listening on %s", cfg.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	<-ctx.Done()
	shutdown, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()
	if err := server.Shutdown(shutdown); err != nil {
		log.Printf("shutdown API: %v", err)
	}
}
