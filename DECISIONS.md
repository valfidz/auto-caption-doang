# DECISIONS — Auto Caption Studio

Catatan asumsi & keputusan teknis. Format: keputusan → alasan.
PRD: `PRD-auto-caption-studio.md` · Panduan kerja: `AGENT-GUIDE-auto-caption-studio.md`.

## D0 — Fondasi & tooling

1. **Root repo = folder ini.** Panduan menggambarkan `auto-caption-studio/` sebagai root; di sini root repo adalah folder proyek yang sudah ada (`apps/`, `packages/`, `workers/`, `assets/`, `data/` langsung di dalamnya).
2. **Versi dipin ke major yang stabil & sesuai panduan.** Nuxt `^3.21`, Vue `^3.5`, Pinia `^3` (+ `@pinia/nuxt` 0.11), NestJS `^11`, Prisma `^6`, TypeScript `^5.9`, Vitest `^3`, tsup `^8`, JASSUB `^2.5`, opentype.js `^1.3.5`. Registry menyediakan Nuxt 4 / Nest 12 / Prisma 8 / TS 7, tetapi panduan menetapkan Nuxt 3 dan ekosistem tersebut belum tentu kompatibel dengan kode/dekorator yang dipakai di sini.
3. **Nama paket:** `@acs/shared`, `@acs/api`, `@acs/web`.
4. **`packages/shared` dibangun dual-format (ESM + CJS) via tsup.** Web (Vite/Nuxt) memakai entry ESM, API (Nest/CJS) memakai entry CJS — satu sumber kebenaran tanpa duplikasi kode.
5. **pnpm 10 memblokir lifecycle script dependensi secara default**, jadi `pnpm-workspace.yaml` memuat `onlyBuiltDependencies` untuk `esbuild`, `prisma`, `@prisma/client`, `@prisma/engines`, `@parcel/watcher`, `sharp`, `vue-demi`.
6. **Store & cache pnpm di dalam repo** (`.pnpm-store`, `.npm-cache` lewat `.npmrc`) supaya build tidak bergantung pada folder home pengguna.

## D1 — Eksekusi proses eksternal (FFmpeg, ffprobe, Python)

7. **stdout/stderr proses anak diredireksi ke berkas sementara, bukan pipe.** Pipe stdio dilarang di sebagian lingkungan Windows (sandbox) dan gagal dengan `EPERM`. Redireksi berkas memberi perilaku identik di Windows/Linux, mendukung callback per baris untuk progres worker, dan menghindari buffer pipe yang penuh pada ffmpeg. Progres FFmpeg juga dibaca dari berkas (`-progress <file>`), bukan `pipe:1`.
8. **Pembatalan:** kill pohon proses (`taskkill /T /F` di Windows, `SIGKILL` di POSIX). Dipakai tombol cancel job.
9. **Model Whisper & cache HuggingFace disimpan di `DATA_DIR/models`** (`HF_HOME` default), agar semua artefak besar tetap di dalam repo/data dan mudah dibersihkan.

## D2 — Konfigurasi & port

10. **API bind ke `127.0.0.1:3001`**, web di `3000`. Web (SPA) memanggil API lewat URL absolut `NUXT_PUBLIC_API_BASE`; CORS diaktifkan di API. Ini menjaga pemrosesan tetap lokal.
11. **Default path dihitung dari root repo** (dicari lewat `pnpm-workspace.yaml`), bukan dari `cwd`, sehingga `pnpm dev`, `nest build`, dan `tsx` menghasilkan path yang sama. Semua path penting dapat dioverride lewat environment variable (lihat `.env.example`).
12. **`DATABASE_URL` default `file:<DATA_DIR>/app.db`.** `apps/api/scripts/db-push.mjs` menghitung URL yang sama agar CLI Prisma dan runtime memakai database yang identik.
13. **Python:** virtualenv di `<repo>/.venv`, dideteksi otomatis oleh `PYTHON_PATH` (fallback `python`/`python3`). `pnpm setup:py` membuat venv + memasang `workers/transcriber/requirements.txt`.

## D3 — Health check (M0)

14. **`GET /health` dan `pnpm run doctor` memakai service yang sama** (`HealthService`), jadi status di UI dan CLI tidak mungkin berbeda. (`pnpm doctor` tanpa `run` bentrok dengan perintah bawaan pnpm.)
15. **Semantik status:** `error` = dependensi wajib tidak siap (FFmpeg, ffprobe, Python, faster-whisper, folder font kosong); `warn` = opsional/tidak menghalangi (NVENC tidak ada, CUDA tidak terdeteksi, model belum diunduh). `ok` keseluruhan = tidak ada `error`.
16. **NVENC diverifikasi dengan encode uji nyata** (2 frame 256×256 ke `-f null`), bukan hanya daftar encoder, karena encoder bisa terdaftar tetapi driver/GPU gagal.

## D4 — Font

17. **`assets/fonts/Montserrat-ExtraBold.ttf`** diunduh dari repo resmi Montserrat (OFL). Tabel `name` diverifikasi: family = `Montserrat ExtraBold`, subfamily = `Regular`, typographic family = `Montserrat`. Karena itu `StyleConfig.fontFamily = "Montserrat ExtraBold"` dan `Bold=0` di ASS, sesuai panduan.
18. **Family name dibaca dari berkas**, bukan ditebak: endpoint `GET /fonts` (M6) membaca tabel `name` tiap font di `FONTS_DIR`, sehingga font tambahan milik pengguna (The Bold Font, Komika Axis) otomatis terdaftar dengan nama yang benar.

## D5 — Build & tooling (revisi saat M0/M1)

19. **Build memakai `tsc` langsung, bukan `tsup`/Nest CLI.** `tsup` (esbuild) dan `@nestjs/cli` sama-sama menjalankan proses pembantu dengan pipe stdio, yang diblokir di lingkungan Windows tertentu; `@nestjs/cli` juga gagal karena resolusi `ajv` yang ter-hoist. `tsc` murni menghasilkan output yang sama untuk kebutuhan proyek ini: `dist/esm` + `dist/cjs` (masing-masing diberi `package.json` kecil berisi `type`), dipakai Vite (web) dan Node/Nest (API).
20. **`nest build` diganti `tsc -p tsconfig.build.json`**, dan `nest start --watch` diganti `tsc -w` + `node --watch dist/main.js`. `doctor` juga dikompilasi lebih dulu (`tsc` + `node dist/cli/doctor.js`) karena `tsx` memakai esbuild.

## D6 — Proyek & penyimpanan (M1)

21. **Path berkas disimpan relatif terhadap `DATA_DIR`** (`projects/<id>/source.mp4`), bukan absolut: memindahkan atau mem-backup folder `data/` tidak merusak proyek, dan tidak ada path Windows yang tertanam di database.
22. **Unggahan streaming memakai `busboy`** dan langsung ditulis ke `data/tmp/upload-<uuid>/`, bukan buffer memori; body parser JSON/urlencoded dimatikan lalu dipasang ulang dengan limit 25 MB (transkrip besar), sehingga ukuran video tidak dibatasi body parser.
23. **Validasi unggahan dilakukan sebelum proyek dibuat:** ekstensi (MP4/MOV/MKV/WebM/M4V/AVI) diperiksa, lalu `ffprobe` harus menemukan stream video. Berkas rusak tidak pernah menjadi baris `Project`.
24. **`streamsearch` ditambahkan sebagai dependency langsung `@acs/api`.** Di lingkungan ini pnpm menautkan `busboy` sebagai junction, sehingga Node tidak mengikuti realpath-nya dan gagal me-resolve dependency internal `busboy`. Menambahkan dependency tersebut membuat resolusi tetap benar tanpa mengubah kode aplikasi.
25. **Progres unggah memakai `XMLHttpRequest`** karena `fetch` tidak memberi event progres upload; seluruh request lain memakai `fetch` biasa.
26. **Video disajikan dengan HTTP Range manual** (`206`, `Content-Range`, `Accept-Ranges`, dukungan suffix range dan 416). Ini syarat agar seek di elemen `<video>` berfungsi, terutama untuk video panjang.

