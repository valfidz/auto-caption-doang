# Auto Caption Studio

Tools web **lokal** untuk membuat caption otomatis dari video lalu men-*burn-in* ke MP4 dengan gaya CapCut: beberapa kata tampil sekaligus, kata yang sedang diucapkan berwarna aquamarine (`#7FFFD4`) disertai efek pop.

Alur: upload video → transkripsi otomatis dengan timestamp per kata → koreksi teks & atur style di editor → export MP4.

- PRD: [`PRD-auto-caption-studio.md`](PRD-auto-caption-studio.md)
- Panduan kerja: [`AGENT-GUIDE-auto-caption-studio.md`](AGENT-GUIDE-auto-caption-studio.md)
- Keputusan teknis: [`DECISIONS.md`](DECISIONS.md)

## Prasyarat

- Node.js ≥ 20 dan pnpm 10
- FFmpeg + ffprobe di `PATH` (atau set `FFMPEG_PATH` / `FFPROBE_PATH`)
- Python 3.10–3.12 (atau set `PYTHON_PATH`); GPU NVIDIA opsional — tanpa CUDA
  transkripsi otomatis jatuh ke CPU (`int8`)

## Setup

```bash
pnpm install
pnpm setup:py      # buat .venv + pasang faster-whisper
pnpm db:push       # buat database SQLite + Prisma client
pnpm run doctor    # verifikasi FFmpeg, ffprobe, Python, CUDA, model, font
```

Font Montserrat ExtraBold sudah disertakan di `assets/fonts/`. Font lain (The Bold Font,
Komika Axis) cukup diletakkan di folder yang sama; daftar family dibaca otomatis oleh `GET /fonts`.

Model Whisper diunduh otomatis oleh `faster-whisper` saat transkripsi pertama (large-v3 ±3 GB).
Untuk mesin dengan VRAM kecil atau untuk uji cepat, unduh model lebih kecil ke folder lokal:

```bash
pnpm fetch:model small
# lalu di .env:  WHISPER_MODEL=D:/path/ke/data/models/local/faster-whisper-small
```

## Menjalankan

```bash
pnpm dev           # API http://127.0.0.1:3001 + web http://localhost:3000
```

Perintah lain:

```bash
pnpm build         # build shared → api → web
pnpm test          # unit + golden test (Vitest) untuk paket shared
pnpm lint
pnpm typecheck
pnpm db:push       # sinkronkan schema Prisma ke SQLite
pnpm run doctor    # status dependensi (juga GET /health)
```

## Konfigurasi

Semua pengaturan lewat environment variable; lihat [`.env.example`](.env.example).
Yang utama: `DATA_DIR`, `FFMPEG_PATH`, `FFPROBE_PATH`, `PYTHON_PATH`, `WHISPER_MODEL`,
`WHISPER_DEVICE`, `WHISPER_COMPUTE`, `FONTS_DIR`, `TEMP_TTL_DAYS`, `PORT`.

Catatan GPU: `faster-whisper` (ctranslate2) membutuhkan DLL CUDA 12 + cuDNN 9. `pnpm run doctor`
melaporkan bila GPU terdeteksi tetapi CUDA tidak siap; worker akan mencoba CPU dan memberi
peringatan di log. Di Windows tanpa toolkit CUDA, pasang `nvidia-cublas-cu12` dan
`nvidia-cudnn-cu12` (lihat komentar di `workers/transcriber/requirements.txt`).

## Struktur

```
apps/api             NestJS REST API + runner job in-process + export FFmpeg
apps/web             Nuxt 3 (SPA) editor caption + preview JASSUB
packages/shared      tipe, template, grouping, generator ASS, pengukur teks (dipakai web & api)
workers/transcriber  worker Python faster-whisper
assets/fonts         font yang dipakai libass & browser
data/                proyek, berkas sementara, SQLite, model (gitignored)
```

## Verifikasi manual per milestone

Semua langkah di bawah bisa dilakukan dari browser di `http://localhost:3000`.

1. **M0** — `pnpm run doctor`: semua dependensi wajib `OK`; halaman `/` menampilkan peringatan
   lingkungan bila ada (mis. CUDA tidak siap / model belum diunduh).
2. **M1** — unggah video 9:16 dari ponsel (metadata rotasi). Kartu proyek harus menampilkan
   dimensi **tampilan** (mis. 1080×1920, bukan 1920×1080) dan video bisa di-seek.
3. **M2** — klik **Mulai transkripsi**; progres berjalan, lalu daftar kata muncul dengan
   timestamp naik monoton. Tombol **Batalkan** menghentikan job dan status proyek kembali normal.
4. **M3** — `pnpm test`: 78 test (grouping, ASS, warna, waktu, escape, edit transkrip, golden
   file untuk 9:16 / 16:9 / 1:1).
5. **M4** — klik **Export MP4**, tunggu 100%, lalu **Unduh MP4**. Caption harus menempel dan
   sinkron; audio tersalin (AAC/MP3) atau ditranskode ke AAC.
6. **M5** — preview menampilkan caption yang sama dengan hasil export. Klik kata untuk seek,
   dobel klik untuk mengedit teks, gunakan **Gabung/Pisah/Hapus**. Perubahan tersimpan otomatis.
7. **M6** — tab **Style**: ganti template, geser handle posisi di preview, ubah warna/ukuran.
   Export ulang dan bandingkan frame pada detik yang sama dengan preview.
8. **M7** — uji video tanpa audio, rekaman layar VFR, video berotasi, WebM/Opus, dan bahasa
   Indonesia. Berkas sementara di `data/tmp` dibersihkan otomatis setelah `TEMP_TTL_DAYS`.

## Keterbatasan yang diketahui

- Video HDR/10-bit dikonversi ke `yuv420p`; warna bisa terlihat pucat (bukan bug).
- Efek pop skala membuat kata di sekitarnya sedikit bergeser (reflow libass). MVP memakai skala
  moderat (±115%); perbaikan pasca-MVP: posisi per kata.
- `large-v3` (float16) membutuhkan VRAM lebih besar dari 4 GB. Di GPU 4 GB gunakan
  `WHISPER_COMPUTE=int8_float16` atau model `small`/`medium`.
- Preview JASSUB berjalan single-threaded bila halaman tidak memakai header COOP/COEP;
  hasil render tetap sama dengan export.
- Preview caption memakai renderer **Canvas2D** secara default karena kanvas WebGL JASSUB
  tampil buram di sebagian GPU/driver (video tampak hitam di balik caption). Caption tetap
  dirender libass yang sama. Untuk mencoba WebGL: tambahkan `?preview=webgl` pada URL editor;
  backend yang aktif terlihat di `<html data-caption-renderer="...">`.
- Batas `TEMP_TTL_DAYS` hanya untuk berkas sementara; video proyek dan hasil export tidak
  dihapus otomatis.

## Status milestone

| Milestone | Status |
|---|---|
| M0 Setup + health check | selesai |
| M1 Upload & probe | selesai |
| M2 Transkripsi | selesai |
| M3 Grouping & ASS | selesai |
| M4 Export | selesai |
| M5 Editor | selesai |
| M6 Style & preset | selesai |
| M7 Polesan | selesai |
