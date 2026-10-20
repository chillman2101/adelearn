# Portal Siswa dan Pengerjaan Ujian

## Tujuan

Menambahkan portal siswa yang mengikuti sistem visual Adelearn, dengan navigasi hanya untuk Ujian dan Pengaturan. Setiap kredensial login mengarah ke satu ujian tertentu. Siswa hanya dapat melihat dan mengerjakan ujian tersebut; semua akses dan percobaan divalidasi oleh API.

## Login dan sesi

- Satu halaman login melayani guru dan siswa dengan pemilih jenis akun. Guru memakai username dan sandi pada record `teachers`; sandi disimpan sebagai hash.
- Siswa login menggunakan ID dan sandi lima karakter yang dihasilkan untuk satu ujian.
- Satu kredensial hanya memiliki satu sesi aktif. Login baru mengganti sesi aktif; browser lama kehilangan akses pada pemeriksaan sesi/API berikutnya.
- Sesi guru memakai token tersimpan sebagai hash; guru dapat login dari lebih dari satu perangkat. Sesi guru dan siswa memiliki role terpisah.
- Token sesi acak disimpan dalam cookie HttpOnly, Secure saat HTTPS, SameSite=Lax, dan tidak diberikan ke JavaScript. Database hanya menyimpan hash token.
- Next.js 16 `proxy.js` memeriksa sesi aktif untuk melindungi rute `/student/*`. API Go tetap memvalidasi sesi di setiap endpoint siswa agar perlindungan tidak bergantung pada UI.
- `proxy.js` juga melindungi halaman dan API guru. API guru membaca session guru; endpoint login dan setup pertama dikecualikan.
- Kredensial yang dicabut saat guru generate ulang tidak dapat login dan sesi lama langsung tidak berlaku.
- Pengguna tanpa sesi diarahkan ke `/student/login`; siswa aktif tidak dapat membuka halaman guru.
- Setup akun guru pertama hanya tersedia selama belum ada username guru, lalu dinonaktifkan permanen.

## Portal siswa

- Menggunakan bahasa visual aplikasi, tetapi shell siswa terpisah dari shell guru.
- Navigasi siswa hanya memuat Ujian dan Pengaturan.
- Halaman Ujian menampilkan ujian yang terikat dengan kredensial, jadwal, status, kesempatan tersisa, dan tombol yang sesuai.
- Pengaturan menampilkan identitas siswa dan konteks ujian serta menyediakan keluar akun. Siswa tidak dapat mengubah data ujian atau data siswa.
- Pengaturan guru menampilkan identitas akun, username, dan formulir ganti sandi dengan verifikasi sandi lama. Pengaturan siswa hanya menyediakan informasi akun dan keluar; sandi akses ujian diubah dengan generate ulang oleh guru.

## Mulai dan mengerjakan ujian

- Tombol mulai membuka dialog konfirmasi buatan aplikasi. Dialog menjelaskan bahwa percobaan yang dimulai tidak bisa dibatalkan; waktu tetap berjalan dan jawaban tersimpan jika halaman ditutup. Siswa dapat melanjutkan percobaan yang sama setelah login kembali pada perangkat aktif.
- Setiap percobaan harus dimulai sejak waktu mulai sampai batas check-in. Timer aktif dimulai saat mulai; tanpa timer, siswa mengirim jawaban sendiri.
- Ujian harus berstatus terbit. Maksimum percobaan adalah satu ditambah jumlah pengulangan yang diatur guru.
- Setiap percobaan menyimpan urutan soal sendiri; set soal mengikuti snapshot ujian. Kunci jawaban tidak pernah dikirim ke browser.
- Jawaban disimpan per perubahan. Timer habis mengunci dan mengirim percobaan. Pengiriman manual memerlukan konfirmasi.
- Soal objektif dinilai otomatis. Esai menunggu penilaian guru. Nilai mengikuti kebijakan ujian: tertinggi, terakhir, atau rata-rata.
- Tipe soal yang didukung mengikuti bank soal: pilihan tunggal, pilihan kompleks, benar/salah, jawaban singkat, isian, esai, menjodohkan, dan mengurutkan.

## Batasan implementasi

- Halaman guru yang ada tetap berjalan setelah sesi guru ditambahkan.
- Tidak membuat akses ujian lintas banyak ujian dari satu login; satu ID/sandi tetap khusus satu ujian sesuai desain kredensial sekarang.
- Tidak menambahkan komunikasi real-time atau layanan pihak ketiga.
- Token sesi tidak disimpan di localStorage atau sessionStorage.

## Kriteria selesai

- Kredensial valid membuka portal untuk ujian terkait; kredensial salah, dicabut, kedaluwarsa, atau sesi tergantikan ditolak.
- Login kedua pada kredensial sama membuat browser pertama tidak dapat melanjutkan.
- Siswa hanya melihat data ujiannya dan soal tanpa kunci.
- Mulai, autosave, lanjut setelah muat ulang, timer, pengiriman, pengulangan, dan penilaian mengikuti aturan di atas.
- Shell dan rute siswa bekerja di desktop dan mobile tanpa mengubah menu guru.
