# 🎓 IziLearning: Ujian Jadi Game Seru

IziLearning mengubah soal pilihan ganda dari **Excel** menjadi **game multiplayer** untuk ulangan harian, UTS, atau challenge di kelas.
Guru membuat room, murid masuk dari HP masing-masing dengan kode room, lalu game dimulai serentak.

- ✅ **Tanpa database & tanpa server berbayar.** Laptop guru menjadi "server". Soal dan jawaban dikirim langsung ke HP murid (peer-to-peer).
- ✅ **Soal diacak per murid** (urutan soal dan pilihan jawaban) supaya tidak saling mencontek.
- ✅ **Nilai langsung muncul** di HP murid, lengkap dengan status LULUS/BELUM LULUS (KKM bisa diatur, bawaan 75).
- ✅ **Tombol pembahasan** untuk melihat jawaban yang benar, plus penjelasan jika diisi di Excel.
- ✅ **Rekap nilai di-download** sebagai Excel: rekap, analisis per soal, dan jawaban tiap murid.
- ✅ **5 jenis game:** 🎯 Kuis Klasik · 🚀 Balap Roket · 👾 Lawan Monster · 🎈 Pecah Balon · 💎 Berburu Harta

---

## 🚀 Cara Deploy (sekali saja, gratis)

Website ini statis (HTML/CSS/JS saja), jadi bisa di-hosting gratis di **GitHub Pages**:

1. Gabungkan (merge) branch ini ke branch `main`.
2. Buka repository di GitHub → **Settings** → **Pages**.
3. Pada **Build and deployment → Source** pilih **Deploy from a branch**, lalu pilih branch `main` dan folder `/ (root)`. Klik **Save**.
4. Tunggu 1–2 menit. Website akan aktif di `https://<username>.github.io/izilearning/`.

Selesai. Link ini bisa dipakai seterusnya. Tidak ada biaya dan tidak ada database yang perlu dirawat.

> Alternatif lain: Netlify / Vercel / Cloudflare Pages (cukup upload folder ini), atau server sekolah mana pun yang bisa menyajikan file statis.

### Bagaimana tanpa penyimpanan bisa jalan?

```
HP Murid ──┐                         ┌── (hanya untuk "berkenalan")
HP Murid ──┼──► WebRTC langsung ◄────┤   Server sinyal PeerJS publik (gratis)
HP Murid ──┘     ke Laptop Guru      └── tidak menyimpan soal/jawaban
```

- Server sinyal PeerJS hanya mempertemukan perangkat. Setelah tersambung, data mengalir langsung antar perangkat.
- Semua data sesi ada di **browser laptop guru**. Jika halaman guru tidak sengaja ter-refresh, sesi bisa dilanjutkan (tombol *Lanjutkan Sesi*).
- Arsip nilai adalah **file Excel yang di-download guru** di akhir sesi.

**Syarat:** laptop guru dan HP murid terhubung ke internet (boleh beda jaringan, misalnya WiFi dan data seluler), dan **laptop guru tetap terbuka** selama ujian.

---

## 📋 Cara Pakai

### Guru
1. Buka website, lalu pilih **Saya Guru**.
2. Upload file Excel soal (klik **Download Template Excel** untuk format yang benar).
3. Pilih jenis game dan mode:
   - **📝 Mode Ujian:** benar/salah tidak ditampilkan per soal, tidak ada peringkat di HP murid, pembahasan terbuka setelah guru mengakhiri sesi (supaya jawaban tidak bocor).
   - **🏆 Mode Challenge:** benar/salah langsung tampil, ada poin, peringkat, dan streak 🔥.
   - Semua pengaturan bisa diubah satu per satu (durasi total, KKM, jumlah soal, acak pilihan, dll).
4. Klik **Buat Room**. Tampilkan kode room / QR ke proyektor.
5. Setelah murid masuk, klik **Mulai Game!**
6. Selama game: tab **Arena** (untuk proyektor) dan **Pantau Murid** (progres, nilai sementara, ⚠️ peringatan jika murid keluar dari halaman). Bisa **tambah waktu 5 menit** atau **akhiri** sesi.
7. Sesi otomatis berakhir saat semua murid selesai atau waktu habis. Klik **Download Nilai (Excel)**.

### Murid
1. Scan QR dari guru, atau buka website → **Saya Murid**.
2. Isi kode room, nama, dan pilih avatar, lalu tunggu guru memulai.
3. Kerjakan soal. Boleh **Lewati dulu** soal yang sulit dan kembali lagi nanti.
4. Setelah selesai, nilai muncul langsung. Klik **Lihat Pembahasan** untuk melihat kunci jawaban.

> Jika HP murid tidak sengaja ter-refresh atau sinyal putus, buka lagi halamannya. Murid otomatis tersambung kembali dan melanjutkan dari soal terakhir.

---

## 📄 Format Excel Soal

| No | Soal | A | B | C | D | Kunci | Gambar | Pembahasan |
|----|------|---|---|---|---|-------|--------|------------|
| 1 | Ibu kota Indonesia adalah ... | Bandung | Jakarta | Surabaya | Medan | B | | Jakarta adalah ibu kota... |

- Baris pertama adalah judul kolom. Urutan kolom bebas, yang penting namanya sesuai (`Soal`, `A`, `B`, `C`, `D`, `Kunci`).
- `Kunci` diisi huruf **A/B/C/D**. Pilihan C dan D boleh kosong (minimal A dan B).
- `Pembahasan` bersifat opsional.
- **Gambar soal** (pilih salah satu):
  - **Tempel/insert gambar langsung di Excel** pada baris soal tersebut (pojok kiri atas gambar berada di baris soal). Mendukung *Place over Cells* dan *Place in Cell*.
  - Atau isi kolom `Gambar` dengan **link gambar** (`https://...`). Link Google Drive harus diatur "Siapa saja yang memiliki link".
- Gambar otomatis dikecilkan supaya cepat terkirim ke HP murid.
- Contoh lengkap: [`contoh/Contoh_Soal_IziLearning.xlsx`](contoh/Contoh_Soal_IziLearning.xlsx)

## 🧮 Penilaian

- **Nilai** = jumlah benar ÷ jumlah soal × 100 (dibulatkan). Soal yang tidak dijawab dihitung salah.
- **Lulus** jika nilai ≥ KKM (bawaan 75).
- **Poin game** (untuk keseruan & peringkat, tidak memengaruhi nilai): benar = 500 + bonus kecepatan (maks. 500) + bonus streak.
- **Kunci jawaban tidak pernah dikirim ke HP murid sebelum ia selesai.** Penilaian dilakukan di laptop guru.

## 📊 Isi File Rekap Nilai

| Sheet | Isi |
|-------|-----|
| Rekap Nilai | Nama, benar, salah, kosong, nilai, status lulus, poin, lama mengerjakan, berapa kali keluar halaman |
| Info Ujian | Judul, tanggal, KKM, rata-rata, nilai tertinggi/terendah, jumlah lulus |
| Analisis Soal | % murid yang menjawab benar per soal, tingkat kesulitan, sebaran pilihan A/B/C/D |
| Jawaban Murid | Jawaban tiap murid untuk tiap soal (✓/✗) |

---

## 🛠️ Untuk Pengembang

Struktur:

```
index.html          Halaman awal (pilih Guru/Murid)
guru.html           Halaman guru (host)
murid.html          Halaman murid
assets/js/config.js Konfigurasi (server PeerJS, batas murid, KKM default)
assets/js/common.js Utilitas, suara, efek
assets/js/excel.js  Baca soal Excel (+ gambar), template, ekspor nilai
assets/js/games.js  5 jenis game: tampilan murid (Stage) & proyektor (Arena)
assets/js/host.js   Logika guru: room, penilaian, sinkronisasi
assets/js/student.js Logika murid
vendor/             PeerJS 1.5.4, SheetJS 0.20.3, JSZip 3.10.1, qrcode-generator 1.4.4
```

Tidak perlu build. Untuk mencoba di komputer sendiri:

```bash
npx http-server -p 8080 .
# buka http://localhost:8080
```

Memakai server PeerJS sendiri (opsional, misalnya untuk jaringan sekolah tanpa internet):

```bash
npx peer --port 9000
# lalu buka: http://<ip-laptop>:8080/guru.html?peerhost=<ip-laptop>&peerport=9000
```

Parameter `peerhost`/`peerport` otomatis ikut di link & QR untuk murid. Bisa juga diset permanen di `assets/js/config.js`.
