# Changelog

Semua perubahan yang signifikan pada proyek ini akan didokumentasikan di file ini.

Format pencatatan berdasarkan [Keep a Changelog](https://keepachangelog.com/id/1.0.0/), dan proyek ini menganut [Semantic Versioning](https://semver.org/lang/id/).

## [1.1.0] - 2026-04-23

Pembaruan besar (Major Refactor) untuk stabilitas, keamanan kelas enterprise, dan modernisasi UX.

### Keamanan (Security)
- **Anti-Spoofing Webhook**: Penambahan validasi silang (cross-validation) ke API Pakasir pada endpoint `/webhook/pakasir` untuk mencegah pemalsuan pembayaran.
- **Database Atomic Write**: Implementasi `fs.renameSync` (Write-Rename) pada layer database (`lib/db.js`) untuk mencegah korupsi file JSON (TOCTOU) akibat *race condition* saat diakses secara bersamaan.
- **Perlindungan Repo**: Menambahkan `.gitignore` untuk melindungi file sensitif (`.env`, `data/`, `database.json`) dan membuat `.env.example` sebagai dokumentasi environment variabel.
- **Watermark & Obfuscation**: Menambahkan enkripsi watermark dan ASCII art logo pada saat bot *startup* (`lib/bootstrap.js`).

### Fitur Baru & Perbaikan Logika (Features)
- **Sistem Keep Stock (Reservasi)**: Stok produk kini otomatis di-*lock* (diambil dari database) ketika user men-generate QRIS. Stok akan dikembalikan otomatis (restock) jika transaksi dibatalkan atau kedaluwarsa.
- **Anti-Spam Transaksi (One-Pending Rule)**: User dibatasi maksimal hanya boleh memiliki 1 transaksi pending (deposit/pembelian) secara bersamaan untuk mencegah spam tagihan.
- **Auto-Restock via Cron Job**: Mengoptimalkan background cron jobs untuk menangani pembersihan pesanan kedaluwarsa secara mandiri beserta pengembalian stoknya.

### Antarmuka & UX (UI/UX)
- **Rebranding**: Mengubah identitas toko secara massal menjadi **BangDet-MD**.
- **Modernisasi Teks**: Mengganti teks yang menumpuk emoji menjadi gaya tipografi yang lebih bersih menggunakan format *blockquote* Telegram.
- **Pembaruan Tombol Navigasi**: Layout tombol disederhanakan menggunakan sistem Grid 2-Kolom dengan penamaan yang lebih konsisten (cth: `« Kembali`, `🏠 Beranda`).
- **Permanent Receipt (Struk Anti-Hilang)**: Struk pembelian sukses kini dikirimkan sebagai pesan independen (permanen) tanpa *inline keyboard* agar tidak tertimpa saat user melakukan navigasi menu.
- **Chat Actions**: Menambahkan aksi bot seperti *typing* dan *upload_photo* agar bot terasa lebih responsif.
- **Penghapusan Hardcoded URL**: Menghapus hardcoded URL webhook dan menggantinya dengan dukungan environment `WEBHOOK_PUBLIC_URL`.

## [1.0.0] - 2026-03-13

### Ditambahkan
- Rilis perdana bot Telegram.
- Fitur Auto Order & Delivery otomatis.
- Integrasi Payment Gateway via Webhook Pakasir.
- Sistem Saldo (Deposit) untuk pengguna.
- Panel Admin Lengkap dalam aplikasi Telegram.
- Fitur keamanan dasar Anti-Spam & Rate Limiter.
