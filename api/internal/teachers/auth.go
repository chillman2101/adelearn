package teachers

import (
	"context"
	cryptorand "crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var ErrInvalidCredentials = errors.New("Username atau sandi tidak sesuai.")
var ErrInvalidSession = errors.New("Sesi guru sudah tidak aktif. Silakan login kembali.")
var ErrSetupClosed = errors.New("Akun guru pertama sudah dibuat.")
var ErrInvalidPassword = errors.New("Sandi lama tidak sesuai.")

type Session struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

type Repository struct{ DB *sql.DB }

func (r *Repository) HasAccounts(ctx context.Context) (bool, error) {
	var exists bool
	err := r.DB.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM teachers WHERE username IS NOT NULL AND password_hash IS NOT NULL)`).Scan(&exists)
	return exists, err
}

func (r *Repository) SetupFirst(ctx context.Context, teacherName, username, password string) (Session, string, error) {
	teacherName = strings.TrimSpace(teacherName)
	username = strings.TrimSpace(username)
	if teacherName == "" || len(username) < 3 || len(password) < 8 {
		return Session{}, "", errors.New("Nama guru wajib diisi, username minimal 3 karakter, dan sandi minimal 8 karakter.")
	}
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return Session{}, "", err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `LOCK TABLE teachers IN SHARE ROW EXCLUSIVE MODE`); err != nil {
		return Session{}, "", err
	}
	var hasAccount bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM teachers WHERE username IS NOT NULL)`).Scan(&hasAccount); err != nil {
		return Session{}, "", err
	}
	if hasAccount {
		return Session{}, "", ErrSetupClosed
	}
	var teacherID string
	err = tx.QueryRowContext(ctx, `SELECT id::text FROM teachers WHERE lower(name)=lower($1)`, teacherName).Scan(&teacherID)
	if errors.Is(err, sql.ErrNoRows) {
		err = tx.QueryRowContext(ctx, `INSERT INTO teachers(name) VALUES($1) RETURNING id::text`, teacherName).Scan(&teacherID)
	}
	if err != nil {
		return Session{}, "", err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return Session{}, "", err
	}
	var session Session
	err = tx.QueryRowContext(ctx, `UPDATE teachers SET username=$2,password_hash=$3 WHERE id=$1 RETURNING id::text,name,username`, teacherID, username, string(hash)).Scan(&session.ID, &session.Name, &session.Username)
	if err != nil {
		return Session{}, "", err
	}
	session.Role = "teacher"
	token, err := newSessionToken()
	if err != nil {
		return Session{}, "", err
	}
	if err = insertSession(ctx, tx, session.ID, token); err != nil {
		return Session{}, "", err
	}
	if err = tx.Commit(); err != nil {
		return Session{}, "", err
	}
	return session, token, nil
}

func (r *Repository) Login(ctx context.Context, username, password string) (Session, string, error) {
	var session Session
	var hash string
	err := r.DB.QueryRowContext(ctx, `SELECT id::text,name,username,password_hash FROM teachers WHERE lower(username)=lower($1) AND username IS NOT NULL`, strings.TrimSpace(username)).Scan(&session.ID, &session.Name, &session.Username, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, "", ErrInvalidCredentials
	}
	if err != nil {
		return Session{}, "", err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return Session{}, "", ErrInvalidCredentials
	}
	token, err := newSessionToken()
	if err != nil {
		return Session{}, "", err
	}
	if err = insertSession(ctx, r.DB, session.ID, token); err != nil {
		return Session{}, "", err
	}
	session.Role = "teacher"
	return session, token, nil
}

func (r *Repository) Authenticate(ctx context.Context, token string) (Session, error) {
	var session Session
	err := r.DB.QueryRowContext(ctx, `SELECT t.id::text,t.name,t.username FROM teacher_sessions s JOIN teachers t ON t.id=s.teacher_id WHERE s.token_hash=$1 AND s.expires_at>now()`, tokenHash(token)).Scan(&session.ID, &session.Name, &session.Username)
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, ErrInvalidSession
	}
	session.Role = "teacher"
	return session, err
}

func (r *Repository) ChangeCredentials(ctx context.Context, session Session, token, oldPassword, newUsername, newPassword string) error {
	newUsername = strings.TrimSpace(newUsername)
	if len(newUsername) < 3 || len(newPassword) < 8 {
		return errors.New("Username minimal 3 karakter dan sandi baru minimal 8 karakter.")
	}
	var oldHash string
	if err := r.DB.QueryRowContext(ctx, `SELECT password_hash FROM teachers WHERE id=$1`, session.ID).Scan(&oldHash); err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(oldHash), []byte(oldPassword)) != nil {
		return ErrInvalidPassword
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `UPDATE teachers SET username=$2,password_hash=$3 WHERE id=$1`, session.ID, newUsername, string(newHash)); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM teacher_sessions WHERE teacher_id=$1 AND token_hash<>$2`, session.ID, tokenHash(token)); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *Repository) Logout(ctx context.Context, token string) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM teacher_sessions WHERE token_hash=$1`, tokenHash(token))
	return err
}

type sessionInserter interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func insertSession(ctx context.Context, db sessionInserter, teacherID, token string) error {
	_, err := db.ExecContext(ctx, `INSERT INTO teacher_sessions(teacher_id,token_hash,expires_at) VALUES($1,$2,$3)`, teacherID, tokenHash(token), time.Now().UTC().Add(24*time.Hour))
	return err
}

func newSessionToken() (string, error) {
	var secret [32]byte
	if _, err := cryptorand.Read(secret[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(secret[:]), nil
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
