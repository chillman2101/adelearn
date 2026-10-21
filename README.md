# Adelearn — Manajemen Ujian.

Tahap pertama menyediakan ruang kerja guru untuk mengelola bank soal dan menyusun ujian untuk satu kelas, termasuk impor soal dari Excel. Sistem menggunakan Next.js (JavaScript), Go REST API, dan PostgreSQL. Siswa, hasil ujian, dan laporan direncanakan pada tahap berikutnya.

## Menjalankan lokal

1. `.env.example` mencatat nama konfigurasi; nilai bawaan saat ini dapat langsung dipakai tanpa membuat file `.env`.
2. Pastikan service PostgreSQL lokal aktif, lalu siapkan role dan database pengembangan.
3. Jalankan API: `cd api`, lalu `go run ./cmd/server`. API menerapkan migrasi pertama kali saat mulai dan tersedia di `http://localhost:8080`.
4. Di terminal lain, jalankan web: `cd web`, lalu `npm run dev`. Buka `http://localhost:3000`.

Contoh persiapan database lokal dari `psql -U postgres`:

```sql
CREATE ROLE adelearn LOGIN PASSWORD 'adelearn';
CREATE DATABASE adelearn OWNER adelearn;
```

Jika role atau database sudah ada, lewati perintah yang sesuai. Kamu juga bisa membuatnya melalui pgAdmin.

Konfigurasi API dibaca dari environment shell: `DATABASE_URL`, `API_ADDR`, `MEDIA_PATH`, dan `MEDIA_URL`. Web menggunakan `NEXT_PUBLIC_API_URL` (default `http://localhost:8080/api/v1`); untuk menggantinya, buat `web/.env.local`. Gambar lokal disimpan pada folder `uploads/` di direktori kerja API. PostgreSQL memakai service lokal; proyek ini tidak memerlukan Docker.

## Alur guru

Mata pelajaran, kelas, dan topik memakai katalog PostgreSQL dengan UUID sebagai relasi. Soal bank memakai mata pelajaran dan topik sehingga dapat digunakan lintas kelas; ujian terhubung ke mata pelajaran dan kelas. Dropdown mendukung pencarian serta pembuatan pilihan baru secara langsung.

1. Tambahkan pertanyaan di **Bank soal**. Delapan tipe yang tersedia: pilihan ganda, pilihan ganda kompleks, benar/salah, jawaban singkat, isian, esai, menjodohkan, dan mengurutkan.
2. Di **Manajemen ujian**, tentukan jumlah soal, jadwal mulai dan batas check-in, timer, pengulangan, kebijakan nilai, lalu pilih soal manual, ambil soal acak dengan filter, atau tulis soal inline.
3. Tinjau komposisi dan bobot. Terbitkan ujian untuk mengunci snapshot isi soal dan kunci jawaban.

Bank soal juga menyediakan **Import soal**. Unduh template CSV yang dapat dibuka di Excel, isi pertanyaan dan `data_json`, unggah sebagai `.csv` atau `.xlsx`, periksa pratinjau serta validasi setiap baris, lalu simpan semua soal sekaligus. Impor dibatasi 500 soal dan 10 MB per file.

Pertanyaan disimpan otomatis hanya saat tombol simpan ditekan. Lampiran menerima PNG, JPG, WEBP, dan GIF sampai 5 MB. API lokal belum memiliki autentikasi; jalankan hanya di lingkungan pengembangan lokal.

## Fase berikutnya

Alur siswa dan peran pengguna, autosave jawaban ujian, pengacakan urutan per siswa/percobaan, hasil, dan laporan guru belum disertakan. Penyimpanan jawaban nanti menggunakan REST dan PostgreSQL; Redis/WebSocket tidak dibutuhkan untuk tahap guru ini.
