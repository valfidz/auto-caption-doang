# Auto Caption Studio

Tools web **lokal** untuk membuat caption otomatis dari video lalu men-*burn-in* ke MP4 dengan gaya CapCut: beberapa kata tampil sekaligus, kata yang sedang diucapkan berwarna aquamarine (`#7FFFD4`) disertai efek pop.

Alur: upload video → transkripsi otomatis dengan timestamp per kata → koreksi teks & atur style di editor → export MP4.

- PRD: [`PRD-auto-caption-studio.md`](PRD-auto-caption-studio.md)
- Panduan kerja: [`AGENT-GUIDE-auto-caption-studio.md`](AGENT-GUIDE-auto-caption-studio.md)
- Keputusan teknis: [`DECISIONS.md`](DECISIONS.md)

## Prasyarat

- Node.js ≥ 20 dan pnpm 10
- FFmpeg + ffprobe di `PATH` (atau set `FFMPEG_PATH` / `FFPROBE_PATH`)
- Python 3.10–3.12 (atau set `PYTHON_PATH`)
- GPU NVIDIA opsional; transkripsi & export jatuh ke CPU bila tidak ada

## Setup

```bash
pnpm install
pnpm setup:py     # buat .venv + pasang faster-whisper
pnpm run doctor   # verifikasi FFmpeg, ffprobe, Python, CUDA, model, font
```

Font Montserrat ExtraBold sudah disertakan di `assets/fonts/`. Font lain (The Bold Font,
Komika Axis) cukup diletakkan di folder yang sama.

## Menjalankan

```bash
pnpm dev          # API http://127.0.0.1:3001 + web http://localhost:3000
```

Perintah lain:

```bash
pnpm build        # build shared → api → web
pnpm test         # unit + golden test (Vitest)
pnpm lint
pnpm db:push      # sinkronkan schema Prisma ke SQLite
pnpm run doctor   # status dependensi (juga tersedia di GET /health)
```

## Konfigurasi

Semua pengaturan lewat environment variable; lihat [`.env.example`](.env.example).
Yang utama: `DATA_DIR`, `FFMPEG_PATH`, `FFPROBE_PATH`, `PYTHON_PATH`, `WHISPER_MODEL`,
`WHISPER_DEVICE`, `WHISPER_COMPUTE`, `FONTS_DIR`, `TEMP_TTL_DAYS`, `PORT`.

## Struktur

```
apps/api        NestJS REST API + runner job in-process + export FFmpeg
apps/web        Nuxt 3 (SPA) editor caption
packages/shared tipe, template, grouping, generator ASS, pengukur teks (dipakai web & api)
workers/transcriber  worker Python faster-whisper
assets/fonts    font yang dipakai libass & browser
data/           proyek, berkas sementara, SQLite (gitignored)
```

## Status milestone

| Milestone | Status |
|---|---|
| M0 Setup + health check | selesai |
| M1 Upload & probe | selesai |
| M2 Transkripsi | belum |
| M3 Grouping & ASS | belum |
| M4 Export | belum |
| M5 Editor | belum |
| M6 Style & preset | belum |
| M7 Polesan | belum |
