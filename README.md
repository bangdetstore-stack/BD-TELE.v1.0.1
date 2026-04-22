# 🤖 Bot Telegram Auto Order — BangDet-MD

Bot Telegram otomatis untuk penjualan produk digital atau aplikasi premium, terintegrasi penuh dengan **Pakasir** sebagai payment gateway (mendukung QRIS dan Virtual Account). Bot ini dilengkapi sistem manajemen produk, panel admin canggih, fitur deposit saldo, serta pengiriman otomatis akun/produk ke pembeli setelah pembayaran berhasil.

---

## ✨ Fitur Utama

- 🛒 **Auto Order & Delivery**: Kirim produk otomatis setelah pembayaran berhasil.
- 💳 **Payment Gateway Terintegrasi**: Pembayaran via QRIS, BRI VA, BNI VA, dan Permata VA menggunakan Pakasir.
- 💰 **Sistem Saldo (Deposit)**: Pengguna dapat melakukan deposit saldo dan membeli produk menggunakan saldo tersebut.
- 👨‍💻 **Panel Admin Lengkap**: Kelola produk, stok otomatis, riwayat pesanan, pengguna, tambah saldo manual, dan fitur broadcast pesan (pengumuman) langsung dari bot Telegram.
- 🔄 **Auto-Reload Data**: Perubahan file database (JSON) langsung terbaca tanpa perlu restart bot.
- 🛡️ **Anti-Spam & Rate Limiter**: Perlindungan dari spam klik atau pesan berulang dari pengguna.
- 📊 **Custom Logger**: Log interaksi bot di konsol untuk memantau aktivitas dengan lebih detail namun rapi.
- ⏱️ **Leaderboard**: Fitur papan peringkat pengguna.

---

## 🛠️ Persyaratan Sistem (Prerequisites)

Sebelum menginstal, pastikan Anda telah menyiapkan:
1. **Node.js** (Versi 16.x atau lebih baru disarankan).
2. **Telegram Bot Token** (Dapatkan dari [@BotFather](https://t.me/BotFather) di Telegram).
3. **Akun Pakasir** (Daftar dan buat Project untuk mendapatkan API Key dan Project Slug).
4. **Server / VPS / Localhost** dengan koneksi internet untuk menjalankan bot dan webhook.

---

## 🚀 Cara Instalasi Pemasangan

Ikuti langkah-langkah di bawah ini untuk menginstal dan menjalankan bot:

1. **Clone / Download File Project**
   Pastikan semua file project telah berada dalam satu folder.

2. **Install Dependencies**
   Buka terminal/command prompt di dalam folder project, jalankan:
   ```bash
   npm install
   ```

3. **Konfigurasi Environment**
   Edit file `.env` di root folder (atau buat jika belum ada) dan isi sesuai konfigurasi Anda:
   ```env
   BOT_TOKEN="Isi_Token_Bot_Dari_BotFather_Di_Sini"
   PAKASIR_PROJECT="Isi_Slug_Project_Pakasir_Di_Sini"
   PAKASIR_API_KEY="Isi_API_Key_Pakasir_Di_Sini"
   WEBHOOK_PORT=12345
   ADMIN_ID="Isi_Telegram_ID_Admin_Di_Sini"
   STORE_NAME="BangDet-MD"
   ```
   *(Peringatan: Jaga kerahasiaan file `.env`. Jangan pernah membagikan atau mempublikasikan file ini ke publik/repository. Semua nilai asli rahasia tidak boleh ditulis secara hardcode).*

4. **Jalankan Bot**
   ```bash
   # Jalankan secara normal
   npm start
   
   # Atau menggunakan node
   node index.js
   
   # Untuk development (auto-restart saat ada perubahan kode)
   npm run dev
   ```

---

## 📂 Struktur Direktori

```text
Bot Telegram/
├── index.js          ← Main entry point (jalankan ini)
├── .env              ← File konfigurasi rahasia
├── package.json      ← Informasi project & dependencies
├── products.json     ← Daftar produk yang dijual
├── data/             ← Folder database otomatis (Jangan dihapus!)
│   ├── accounts.json ← Data akun produk yang tersisa
│   ├── deposits.json ← Riwayat deposit user
│   ├── orders.json   ← Riwayat seluruh order
│   ├── pending.json  ← Data transaksi tertunda
│   └── users.json    ← Data pengguna (saldo, profil, dll)
├── lib/              ← Modul dan Utilitas
│   ├── db.js         ← Database helper (JSON Manager)
│   ├── pakasir.js    ← Wrapper API Pakasir
│   ├── qris.js       ← Generator QR Code untuk pembayaran
│   ├── cron.js       ← Background job (pengecekan expired, dll)
│   └── utils.js      ← Fungsi-fungsi pembantu (format rupiah, dll)
└── handlers/         ← Logika perintah (Command & Callback)
    ├── admin.js      ← Panel admin & fiturnya
    ├── deposit.js    ← Proses menu deposit saldo
    ├── leaderboard.js← Papan peringkat
    ├── payment.js    ← Sistem checkout & pembayaran
    ├── products.js   ← Etalase produk & pencarian
    ├── profile.js    ← Menu profil user & riwayat
    └── start.js      ← Perintah /start
```

---

## 🌐 Setting Webhook Pembayaran (Pakasir)

Bot ini menggunakan **Webhook** agar Pakasir bisa memberitahu bot saat pembayaran pengguna (QRIS/VA) telah "completed".
Server webhook bawaan berjalan sesuai Port yang diatur di `.env` (Default: `12345`).

**Jika menjalankan di Localhost (ngrok):**
1. Jalankan ngrok di port webhook:
   ```bash
   ngrok http 12345
   ```
2. Anda akan mendapat Forwarding URL (contoh: `https://abcd-xyz.ngrok-free.app`).
3. Set Webhook URL di Dashboard Pakasir -> Edit Proyek, ubah URL Webhook menjadi:
   `https://abcd-xyz.ngrok-free.app/webhook/pakasir`

**Jika menjalankan di VPS / Hosting (IP Publik):**
1. Pastikan port server terbuka pada firewall VPS (contoh: port `12345`).
2. Masukkan URL Webhook target di Pakasir, misal:
   `http://IP_VPS_ANDA:12345/webhook/pakasir`
3. Pakasir akan mengirim notifikasi HTTP POST secara otomatis saat pembayaran pengguna berhasil.

---

## 🎛️ Fitur & Penggunaan Bot

### 👥 Perintah Untuk Pengguna (User):
- `/start` atau `/menu` - Membuka menu interaktif utama (menggunakan Inline Keyboard).
- `/saldo` - Mengecek saldo instan berdasarkan ID Panggilan.
- `/profil` - Melihat ID Telegram, Profil, Riwayat, dan Saldo akun.
- `/reset` - Memperbarui status / layout pesan dari bot apabila terdapat kendala terhentinya aksi (bug visual / stuck).

**Tombol Interaktif Tersedia pada Menu Utama:**
- **🏷️ List Produk**: Mencari dan melihat daftar lengkap produk berdasarkan kategori yang terdaftar.
- **📦 Stock**: Cek cepat ketersediaan seluruh item di dalam toko tanpa harus membuka menu detail.
- **💰 Deposit**: Pengisian pundi saldo melalui Gateway (QRIS, BRI VA, BNI VA, Permata VA). Ada Opsi Pilih Nominal/Kustom.
- **📋 Riwayat Order**: Menampilkan rekap histori dan log status 10 transaksi atau top-up terakhir.
- **🏆 Leaderboard**: Papan peringkat pelanggan setia.
- **ℹ️ Informasi** & **✨ Cara Order**: Ketentuan, informasi operasional toko, dan panduan dasar pemesanan.

---

### 👑 Perintah & Fitur Khusus Admin:
*(Hanya terbuka bagi Telegram ID yang sesuai dengan konfigurasi `ADMIN_ID` di file `.env`)*

- `/admin` - Membuka pusat kontrol komando manajemen.
- `/kirim <userId> <orderId> <detail_pesan>` - Pengiriman instruksi/pesan/data akun manual secara *Direct Message* ke *User* terkait bilamana terjadi masalah teknis saat pembagian otomatis.

**Pusat Kendali - Panel Admin (Via Inline Keyboard):**
- **📦 Kelola Produk**:
  - Penambahan produk baru via antarmuka obrolan secara terbimbing tahap demi tahap.
  - Modifikasi / Edit katalog yang sudah ada (mengubah Nama, Harga Set, Tipe Kategori, Deskripsi Tambahan, Panduan, Aturan Khusus).
  - Penghapusan produk secara terpusat.
- **📦 Kelola Stok (Inventaris Data)**: Menyuntikkan serial/password/akun/lisensi dari dalam aplikasi Telegram secara bertahap. Bot mengambil peran rotasi otomatis saat membagikannya kepada pembeli sah.
- **🛒 Data Order**: Perekaman aktivitas checkout dan status seluruh konsumen.
- **👥 Data User**: Basis data semua nomor identitas target yang telah terkoneksi.
- **💰 Tambah Saldo Manual**: Injeksi kredit dompet top-up sebagai reward atau kompensasi pesanan manual.
- **📢 Broadcast**: Menyebarkan pesan penawaran / siaran publik / pengumuman kepada *SELURUH* anggota di database.

---

## 📦 Cara Menambahkan Produk & Stok Data Akun

Pengelolaan etalase dibedakan menjadi dua teknis operasional, di antaranya:

**1. Menggunakan Panel Admin Bot (Disarankan untuk Pemula/Daily Use)**
- Buka PM Bot lalu ketik `/admin`.
- Klik tombol **📦 Kelola Produk** >> **➕ Tambah Produk**.
- Ikuti respon dialognya seperti memasukkan (1) Nama Produk, (2) Harga Jual Rupiah, (3) Ketik Kategori, dan (4) Kutipan Deskripsi singkat.
- Setelah produk jadi, masuk ke modul pengisian item >> Pilih **Kelola Stok** >> tentukan produk sasaran Anda, lalu tempel isi item per baris pengiriman pesan ke bot.
  *(Misal di-copy paste: `email: customer@gmail.com | pass: rahasia123`)*.

**2. Melalui Konfigurasi Backend Json Khusus / Modifikasi File (Advanced)**
Katalog produk merujuk ke data `products.json` dan penyimpanan stok detail tersimpan mandiri pada struktur `data/accounts.json`.
Contoh `products.json`:
```json
{
  "id": 11,
  "nama": "Netflix Premium 1 Bulan",
  "harga": 35000,
  "stok": 0,
  "kategori": "Streaming",
  "deskripsi": "Akun Premium legal original.",
  "cara_penggunaan": "Silakan masuk ke portal netflix langsung dengan akses dikirim",
  "snk": "Dilarang ganti struktur penagihan dan password"
}
```

---

## ⚠️ Keamanan, Privasi & Disclaimer

- **Isolasi Key:** Jangan pernah mengekspos rincian `BOT_TOKEN`, `PAKASIR_API_KEY`, folder isi `/data/`, file konfigurasi `.env`, atau log konsol ke forum publik (seperti komit riwayat Git / GitHub Publik).
- **Pengamanan History:** Buat proteksi manual dan cadangkan (*Backup*) folder instalasi serta spesifik kepada subfolder `data/` sesering mungkin untuk menghindari disrupsi saat server terhenti.
- Segala bentuk manipulasi data disarankan sewaktu posisi state Node js dimatikan demi menghindari *Race Condition* baca-tulis IO atau file terkunci dari background watcher bawaan.

---
<p align="center">
  <i>© BANGDET AUTO ORDER TELE — All Rights Reserved</i>
</p>
