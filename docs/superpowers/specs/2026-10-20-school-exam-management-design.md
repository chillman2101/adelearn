# Spesifikasi Sistem Manajemen Ujian dan Soal

## Tujuan

Membangun sistem ujian sekolah yang dimulai dengan satu kelas. Tahap awal berfokus pada kemampuan guru mengelola ujian dan soal. Sistem dirancang agar alur siswa mengerjakan ujian dapat ditambahkan setelah fondasi ujian, bank soal, versi soal, dan aturan penilaian siap.

Panduan yang tersedia adalah tutorial Klasmart untuk siswa. Panduan tersebut memperlihatkan ujian pilihan ganda, pilihan ganda kompleks, benar/salah, penggunaan gambar pada soal, navigasi soal, indikator jawaban, pelaporan kendala, dan konfirmasi akhir ujian. Fitur lain di bawah ini berasal dari kebutuhan dan keputusan dalam percakapan, bukan dari tutorial.

## Pengguna dan ruang lingkup

- **Guru:** membuat dan mengatur ujian, mengelola bank soal, memilih atau menulis soal, menentukan jadwal dan aturan pengerjaan.
- **Siswa:** pada tahap berikutnya dapat mengikuti ujian dengan pengaturan dan soal yang disiapkan guru. Simpanan jawaban dan percobaan siswa termasuk kebutuhan desain agar perilaku ujian konsisten, tetapi layar siswa bukan fokus implementasi pertama.
- Sistem pertama kali dipakai untuk satu kelas. Struktur filter kelas dapat mendukung perluasan kemudian.

### Termasuk tahap awal

- Manajemen ujian dan bank soal untuk guru.
- Tiga cara memasukkan soal ke ujian: memilih satu per satu dari bank, mengambil secara acak dari bank, dan membuat soal baru langsung pada ujian.
- Pengaturan waktu, timer, pengacakan, bobot nilai, pengulangan, dan aturan pemilihan nilai akhir.
- Dukungan lampiran gambar pada badan soal dan pilihan jawaban.

### Ditunda

- Laporan guru dan tampilan hasil siswa sebagai fitur produk penuh.
- Pengelolaan sekolah lain di luar fokus ujian.

## Alur guru

Bank soal dapat diimpor dari `.xlsx` atau `.csv` menggunakan template. File dipratinjau dan divalidasi per baris sebelum penyimpanan; jika ada baris tidak valid, tidak ada soal yang disimpan. Satu impor maksimum 500 soal dan 10 MB.

### Katalog metadata

Mata pelajaran, kelas, dan topik disimpan pada tabel referensi. Form guru menyediakan dropdown pencarian dengan tindakan membuat item baru langsung dari dropdown. Topik dapat dikaitkan dengan mata pelajaran. Migrasi mengisi katalog dari label soal dan ujian yang sudah tersimpan.

1. Guru membuat ujian dan mengisi informasi pokok seperti judul, mata pelajaran, kelas, tanggal, waktu mulai, dan waktu akhir check-in. Rincian kolom yang wajib diisi dapat ditentukan saat perancangan UI.
2. Guru menentukan apakah timer digunakan. Jika aktif, guru menentukan durasi pengerjaan.
3. Guru menentukan jumlah pengulangan yang diizinkan di atas percobaan pertama. Contoh: 2 pengulangan berarti maksimum 3 percobaan.
4. Guru menentukan kebijakan nilai akhir lewat dropdown: nilai tertinggi, percobaan terakhir, atau rata-rata.
5. Guru menentukan jumlah soal, lalu mengisi ujian dengan satu atau beberapa cara: memilih soal dari bank, mengambil soal acak dari bank berdasarkan filter, atau membuat soal baru di dalam ujian. Rekomendasi: soal baru dapat ditandai untuk disimpan kembali ke bank.
6. Guru dapat mengatur bobot untuk setiap soal dan memeriksa susunan sebelum memublikasikan.
7. Saat dipublikasikan, ujian mengambil snapshot dari soal dan kunci jawaban. Perubahan pada bank soal setelah publikasi tidak mengubah ujian yang telah dipublikasikan.

## Bank soal

Bank soal mendukung pencarian kata kunci dan filter yang bisa digabung:

- Mata pelajaran
- Topik atau bab
- Kelas
- Tipe soal
- Tingkat kesulitan
- Tag
- Pembuat soal
- Status pernah dipakai

Filter kelas tetap tersedia meski versi awal hanya mengelola satu kelas. Perluasan data kelas berada di luar implementasi awal.

## Tipe soal

Tipe awal yang diusulkan:

1. Pilihan ganda satu jawaban benar.
2. Pilihan ganda kompleks dengan beberapa jawaban benar.
3. Benar/salah, termasuk tabel yang berisi beberapa pernyataan.
4. Isian singkat.
5. Isian rumpang.
6. Esai atau jawaban panjang.
7. Menjodohkan pasangan.
8. Mengurutkan item.

Gambar adalah lampiran yang dapat digunakan pada badan soal maupun pilihan jawaban, bukan tipe jawaban terpisah. Tipe-tipe selain tiga yang tampak di tutorial merupakan perluasan yang diusulkan agar sistem dapat menangani variasi soal lebih lengkap.

## Penilaian

- Guru mengisi bobot angka untuk setiap soal.
- Untuk pilihan ganda kompleks, bobot soal dibagi rata ke jawaban benar. Setiap jawaban benar yang dipilih memberi bagian bobotnya; memilih opsi keliru memberi 0 dan tidak mengurangi nilai.
- Skor ditampilkan sebagai poin yang diperoleh dari total poin maksimal dan dikonversi ke skala 100. Rumus konversi yang diusulkan: `poin diperoleh / poin maksimal × 100`.
- Tipe objektif dapat dinilai otomatis. Esai memerlukan penilaian guru; alur penilaian manual penuh termasuk tahap laporan/hasil berikutnya.
- Untuk isian singkat dan rumpang, pencocokan tidak peka terhadap kapitalisasi dan spasi di tepi jawaban. Guru dapat memasukkan beberapa jawaban alternatif yang diterima. Ejaan, tanda baca, dan spasi di bagian dalam tetap harus cocok dengan salah satu jawaban yang diterima.
- Untuk menjodohkan dan mengurutkan, bobot soal dibagi rata per pasangan atau posisi yang benar. Pasangan/posisi keliru tidak menambah atau mengurangi nilai.

## Jadwal, pengerjaan, dan percobaan

- Ujian memiliki waktu mulai dan batas akhir untuk check-in. Siswa yang check-in sebelum batas akhir dapat mulai; check-in yang terlambat ditolak.
- Jika timer aktif, hitungan durasi penuh dimulai ketika siswa check-in. Waktu pengerjaan dapat berlanjut melewati batas akhir check-in.
- Jika timer tidak aktif, tidak ada hitung mundur per percobaan. Asumsi sementara: siswa menyelesaikan percobaan dengan mengirimkannya sendiri.
- Jawaban disimpan setiap kali siswa mengubah jawaban.
- Jika koneksi terputus atau halaman ditutup, siswa dapat masuk kembali ke percobaan yang sama. Timer tetap berjalan sejak waktu check-in.
- Ketika timer habis, sistem mengubah status percobaan menjadi kedaluwarsa dan mengunci pengerjaan. Jawaban tersimpan tetap tersedia; tidak perlu proses kirim ulang untuk menyelamatkannya.
- Jumlah pengulangan dan kebijakan nilai akhir diatur pada ujian. Setiap pengulangan memakai set soal yang sama.
- Setiap percobaan, termasuk pengulangan, harus dimulai sebelum batas akhir check-in. Pengulangan tidak dapat dimulai setelah batas tersebut.
- Semua siswa memakai set soal yang sama, termasuk jika set tersebut diambil secara acak dari bank. Urutan soal berbeda per siswa dan dapat berbeda pada percobaan ulang.
- Urutan pilihan jawaban dapat diacak per siswa. Kunci harus mengikuti identitas opsi, bukan posisi tampilannya.

## Keputusan desain dan asumsi sementara

- Satu ujian boleh menggabungkan soal pilihan manual dari bank, soal acak dari bank, dan soal yang dibuat langsung di ujian. Ini mengakomodasi permintaan agar guru mendapat banyak pilihan cara menyusun soal.
- Soal yang dibuat langsung pada ujian memiliki pilihan untuk disimpan ke bank; perilaku default belum diputuskan.
- Batas akhir ujian hanya membatasi check-in baru, bukan memutus percobaan yang sudah dimulai.
- Untuk ujian tanpa timer, percobaan dianggap berakhir saat siswa mengirimkannya sendiri.
- Status seperti `draft`, `published`, `in progress`, `completed`, dan `expired` merupakan usulan teknis agar perubahan dan percobaan dapat dilacak. Nama status di UI belum final.
- Pencocokan isian mengabaikan kapitalisasi dan spasi tepi serta mendukung jawaban alternatif; ejaan, tanda baca, dan spasi internal harus cocok dengan salah satu alternatif.
- Untuk menjodohkan dan mengurutkan, setiap pasangan atau posisi yang benar memberi bagian bobot secara proporsional; kesalahan memberi 0.
- Batas akhir check-in berlaku untuk setiap percobaan, termasuk pengulangan.
- Stack aplikasi belum ditentukan. Project yang tersedia saat ini hanya berisi PDF tutorial, tanpa kode aplikasi atau kontrak API yang dapat digunakan sebagai dasar pemilihan stack.

## Kriteria keberhasilan produk

- Guru dapat menyusun ujian dari bank dan dari soal baru, menetapkan aturan ujian, lalu memublikasikan versi yang stabil.
- Filter memungkinkan guru menemukan soal dengan beberapa kriteria sekaligus.
- Soal gambar dan seluruh tipe soal yang disepakati dapat disimpan di bank serta dipakai dalam ujian.
- Pengacakan tidak mengubah kunci jawaban, dan setiap siswa tetap mendapat set soal yang sama.
- Jawaban tersimpan sebelum waktu berakhir, percobaan dapat dilanjutkan setelah gangguan koneksi, dan skor dapat disajikan sebagai poin serta skala 100.
