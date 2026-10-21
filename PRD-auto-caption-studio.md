# PRD — Auto Caption Studio

*Nama kerja: Auto Caption Studio · Versi 1.0 (draft siap dikerjakan) · 20 Oktober 2026 · Pemilik: Nopal · Pemakaian: pribadi (single-user)*

## 1. Ringkasan

Auto Caption Studio adalah tools berbasis web yang berjalan lokal untuk membuat caption otomatis dari video, lalu men-*burn-in* caption itu ke video dalam bentuk MP4. Gaya caption meniru auto caption CapCut: beberapa kata tampil sekaligus, dan **kata yang sedang diucapkan di-highlight dengan warna aquamarine disertai efek pop (membesar cepat lalu kembali)**.

Alur inti: upload video → transkripsi otomatis dengan timestamp per kata → koreksi teks dan atur style di editor → export MP4 dengan caption menempel.

## 2. Tujuan dan non-tujuan

**Tujuan**
- Menghasilkan caption berkualitas siap posting untuk video sosial media dengan klik seminimal mungkin.
- Tampilan caption mirip CapCut (template "Pop Bounce" sebagai default).
- Preview di editor harus **identik** dengan hasil export.
- Berjalan lokal dengan GPU: tanpa biaya API, tanpa batas ukuran file.

**Non-tujuan (MVP)**
- Multi-user, login, billing, kuota, dan deployment publik.
- Editing video (trim, potong, efek, musik) di luar caption.
- Terjemahan otomatis, emoji otomatis, dan B-roll.
- Output selain MP4 (SRT/ASS terpisah hanya nice-to-have).
- Template berkotak/rounded background per kata (fase lanjutan).

## 3. Pengguna dan konteks

Satu pengguna (pemilik), memproses video sosial media dalam rasio 9:16, 16:9, dan rasio umum lain (1:1, 4:5). Bahasa ucapan **lebih sering Inggris, kadang Indonesia**. Durasi tidak dibatasi secara keras. Mesin lokal memiliki GPU NVIDIA.

## 4. User stories

- Sebagai pengguna, saya mengunggah video dan mendapat caption otomatis tanpa mengetik.
- Sebagai pengguna, saya memilih bahasa (English / Indonesia / Auto) sebelum transkripsi, dengan default English.
- Sebagai pengguna, saya memperbaiki kata yang salah dengar langsung di daftar caption.
- Sebagai pengguna, saya memilih template caption lalu menyesuaikan font, ukuran, warna, outline, dan posisi.
- Sebagai pengguna, saya menggeser posisi caption langsung di preview.
- Sebagai pengguna, saya melihat preview sinkron dengan video sebelum export.
- Sebagai pengguna, saya mengekspor MP4 dengan caption menempel, dengan progres yang jelas, lalu mengunduhnya.
- Sebagai pengguna, saya menyimpan style andalan sebagai preset dan memakainya sebagai default.

## 5. Alur utama

1. **Upload** video (drag-and-drop atau pilih file). Sistem membaca metadata (resolusi tampilan, fps, durasi, rotasi).
2. **Pilih bahasa**, lalu mulai transkripsi. Progres ditampilkan.
3. **Editor** terbuka: preview video + caption, daftar caption, panel style.
4. **Koreksi dan styling.** Preview diperbarui langsung.
5. **Export.** Render MP4 dengan progres, lalu tombol unduh.

## 6. Requirement fungsional

**FR-1 Upload dan metadata**
- Menerima format umum: MP4, MOV, MKV, WebM (audio-only tidak wajib).
- Membaca resolusi tampilan (memperhitungkan rotasi), fps, dan durasi.
- Tidak ada batas durasi keras; tampilkan peringatan estimasi waktu untuk video panjang.

**FR-2 Transkripsi**
- Menghasilkan teks dengan **timestamp per kata** memakai faster-whisper (GPU).
- Pilihan bahasa: English (default), Indonesia, Auto-detect.
- Progres dan status error terlihat di UI. Satu job diproses pada satu waktu.

**FR-3 Pengelompokan caption (grouping)**
- Maksimum **4 kata per layar** (dapat diubah di panel style).
- Grup dipecah pada tanda baca akhir kalimat, jeda panjang antar-kata (default > 0,5 detik), dan ketika lebar teks melebihi sekitar 80% lebar video.
- Satu grup hanya satu baris.

**FR-4 Perilaku highlight (Mode A)**
- Semua kata dalam grup tampil sekaligus.
- Kata yang sedang diucapkan berwarna aquamarine dan mendapat animasi pop; kata lain tetap warna dasar.
- Highlight berpindah ke kata berikutnya tanpa kedipan. Jika ada jeda panjang, grup hilang setelah kata terakhir selesai.

**FR-5 Editor teks**
- Daftar caption di samping preview; klik item untuk loncat ke waktu tersebut.
- Edit teks per kata inline, gabung/pisah kata, dan hapus kata.
- Perubahan teks mempertahankan timestamp kata yang tidak diubah.
- *Nice-to-have:* geser timing per kata (drag di timeline).

**FR-6 Style dan template**
- Panel style: template, font, ukuran, warna teks, warna highlight, tebal outline, warna outline, shadow, huruf kapital (uppercase), skala pop, maks kata per layar.
- Posisi dapat digeser langsung di preview; disimpan dalam persen sehingga berlaku untuk semua rasio video.
- Template bawaan (lihat bagian 8) dan kemampuan menyimpan preset sendiri, termasuk menjadikannya default.

**FR-7 Preview**
- Preview memakai renderer yang sama dengan export (ASS + libass lewat JASSUB), sinkron dengan pemutaran video.

**FR-8 Export**
- Output **MP4 (H.264)** dengan caption burn-in; resolusi dan fps mengikuti video asli; audio disalin tanpa re-encode.
- Encode GPU (NVENC) dengan fallback ke CPU (libx264) bila NVENC tidak tersedia.
- Progres export tampil dan hasil dapat diunduh.

**FR-9 Proyek dan penyimpanan**
- Setiap video menjadi proyek; transkrip dan style tersimpan sehingga dapat dibuka ulang.
- Berkas sementara dibersihkan otomatis setelah beberapa hari (dapat diatur).

## 7. Spesifikasi style default: "Pop Bounce"

| Properti | Nilai default |
|---|---|
| Font | Montserrat ExtraBold (bold sans-serif) |
| Warna teks dasar | Putih `#FFFFFF` |
| Warna kata aktif | Aquamarine `#7FFFD4` |
| Outline | Hitam, tebal (sekitar 12% dari ukuran font) |
| Shadow | Hitam, tajam, offset kecil |
| Uppercase | Aktif |
| Maks kata per layar | 4 |
| Animasi pop | Skala 85% → 115% (±90 ms) → 100% (±90 ms) |
| Posisi | Tengah horizontal; vertikal sekitar 72% dari atas (agak di bawah, tidak terlalu bawah) |
| Ukuran font | Persentase dari sisi terpendek video (default 6,5%), agar teks 4 kata muat di 9:16 dan konsisten di semua rasio |

Font alternatif yang diinginkan: The Bold Font dan Komika Axis (lisensi gratis untuk pemakaian pribadi; cukup untuk tools ini).

## 8. Template

| # | Template | Deskripsi | Fase |
|---|---|---|---|
| 1 | **Pop Bounce** (default) | Gaya di bagian 7 | MVP |
| 2 | **Karaoke Highlight** | Semua kata tampil, kata aktif berganti warna tanpa animasi skala | MVP |
| 3 | **One Word** | Satu kata besar, berganti per kata | MVP |
| 4 | **Clean Subtitle** | Kalimat utuh, tanpa animasi, outline halus | MVP |
| 5 | **Box Highlight** | Kotak berwarna di belakang kata aktif | Pasca-MVP |

## 9. Requirement non-fungsional

- **Kesesuaian preview dan hasil:** teks caption pada preview dan hasil export harus sama (satu generator ASS bersama).
- **Performa:** transkripsi dan render memanfaatkan GPU; UI tidak membeku selama job berjalan.
- **Portabilitas:** harus berjalan di Windows dan Linux (tanpa asumsi path; FFmpeg dan model dapat diatur lewat environment variable).
- **Keandalan:** job yang gagal menampilkan pesan yang jelas dan dapat diulang; tidak ada proses yatim setelah restart.
- **Privasi:** semua pemrosesan lokal; tidak ada data dikirim ke layanan eksternal.

## 10. Asumsi dan batasan

- Pengguna tunggal pada mesin lokal dengan GPU NVIDIA dan FFmpeg terpasang.
- Video HDR/10-bit tidak diprioritaskan (hasil dikonversi ke yuv420p; warna HDR bisa terlihat pucat).
- Video campuran dua bahasa dalam satu kalimat dapat menghasilkan transkripsi kurang akurat; editor koreksi menjadi jalan keluarnya.

## 11. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Kata di sekitar kata aktif bergeser saat kata aktif membesar (reflow teks libass) | MVP: skala pop moderat (±115%). Perbaikan: hitung lebar tiap kata dari metrik font dan posisikan tiap kata secara tetap |
| Nama font tidak cocok sehingga libass memakai font pengganti | Sediakan folder font sendiri, verifikasi nama family dari berkas font, dan uji pada render nyata |
| Timestamp kata kurang presisi | Aktifkan VAD, pertimbangkan alignment tambahan (WhisperX) bila perlu |
| Video VFR/rotasi (rekaman layar, video ponsel) menggeser timing atau dimensi | Gunakan dimensi tampilan dari ffprobe; uji dengan sampel VFR dan video yang dirotasi |
| Salah dengar pada bahasa Indonesia atau campuran | Editor koreksi yang nyaman; opsi bahasa per video |

## 12. Fase pengerjaan

- **M0** Setup monorepo dan pengecekan lingkungan (FFmpeg, GPU, model).
- **M1** Upload, probe metadata, dan penyimpanan proyek.
- **M2** Worker transkripsi dengan timestamp per kata.
- **M3** Grouping dan generator ASS (paket bersama) dengan unit test.
- **M4** Export MP4 burn-in dengan progres.
- **M5** Editor: preview JASSUB, daftar caption, edit teks.
- **M6** Panel style, template, preset, drag posisi.
- **M7** Polesan: penanganan error, pembersihan berkas, pengujian rasio dan sampel sulit.
- **Pasca-MVP:** geser timing per kata, hitung posisi per kata (anti-reflow), Box Highlight, batch processing, ekspor SRT/ASS.

## 13. Kriteria keberhasilan

- Video 9:16 berdurasi 60 detik: dari upload sampai MP4 jadi, tanpa koreksi, dalam hitungan beberapa menit pada mesin GPU.
- Highlight terlihat selaras dengan ucapan (tidak terlambat/terlalu cepat secara kasat mata).
- Preview dan hasil export tampak sama pada pembandingan berdampingan.
- Pop Bounce tampak sebanding dengan template CapCut yang dijadikan acuan.
- Berfungsi untuk 9:16, 16:9, dan 1:1 tanpa teks terpotong.

## 14. Pertanyaan terbuka

- Seberapa besar skala font default yang paling nyaman untuk 16:9 dibandingkan 9:16 (ditentukan saat uji visual)?
- Perlukah batch processing sejak awal, atau setelah MVP stabil?
- Perlukah ekspor SRT/ASS bersamaan dengan MP4 sebagai bonus?
