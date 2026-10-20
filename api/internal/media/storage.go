package media

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type Store struct {
	Dir     string
	BaseURL string
}
type Upload struct {
	ID          string `json:"id"`
	URL         string `json:"url"`
	Name        string `json:"name"`
	Size        int64  `json:"size"`
	ContentType string `json:"content_type"`
}

func (s Store) Save(file io.Reader, name, contentType string) (Upload, error) {
	if contentType != "image/png" && contentType != "image/jpeg" && contentType != "image/webp" && contentType != "image/gif" {
		return Upload{}, fmt.Errorf("format gambar harus PNG, JPG, WEBP, atau GIF")
	}
	var ext string
	switch contentType {
	case "image/png":
		ext = ".png"
	case "image/jpeg":
		ext = ".jpg"
	case "image/webp":
		ext = ".webp"
	case "image/gif":
		ext = ".gif"
	default:
		return Upload{}, fmt.Errorf("format gambar harus PNG, JPG, WEBP, atau GIF")
	}
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return Upload{}, err
	}
	id := hex.EncodeToString(b[:])
	if err := os.MkdirAll(s.Dir, 0755); err != nil {
		return Upload{}, err
	}
	out, err := os.Create(filepath.Join(s.Dir, id+ext))
	if err != nil {
		return Upload{}, err
	}
	defer out.Close()
	n, err := io.Copy(out, io.LimitReader(file, 5<<20+1))
	if err != nil {
		return Upload{}, err
	}
	if n > 5<<20 {
		os.Remove(out.Name())
		return Upload{}, fmt.Errorf("ukuran gambar maksimal 5 MB")
	}
	return Upload{ID: id, URL: strings.TrimRight(s.BaseURL, "/") + "/" + id + ext, Name: filepath.Base(name), Size: n, ContentType: contentType}, nil
}
func (s Store) Serve(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(r.URL.Path)
	if name == "." || name == "/" {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, filepath.Join(s.Dir, name))
}
