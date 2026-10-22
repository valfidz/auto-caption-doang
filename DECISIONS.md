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

## D7 — Preview JASSUB (M5)

27. **Aset JASSUB dibundel Vite, bukan disalin ke `public/`.** Worker JASSUB mengimpor modul bare (`abslink`, `lfa-ponyfill`) yang tidak bisa diselesaikan browser tanpa bundler, jadi `workerUrl`/`wasmUrl` diambil dari impor `?worker&url` / `?url`. Menyalin file mentah ke `public/` akan gagal di runtime.
28. **Font di-preload lewat opsi `fonts`, bukan hanya `availableFonts`.** `availableFonts` saja tidak memicu pemuatan font saat libass memintanya, sehingga libass tidak menemukan satu pun font (`fontselect: failed to find any fallback`). Font yang dipakai (`fonts: [url]`) selalu dipreload; `availableFonts` tetap diisi agar keluarga font lain bisa dimuat bila dipakai.
29. **`<video crossorigin="anonymous">` wajib.** Tanpa itu, video dari API (origin berbeda) dianggap *tainted*, `VideoFrame` gagal dibuat, dan JASSUB tidak bisa merender. API mengirim `Access-Control-Allow-Origin` untuk origin web.
30. **ASS untuk preview dibuat oleh fungsi yang sama dengan export** (`buildGroups` + `generateAss` di `packages/shared`). Verifikasi visual: frame export pada `t=5,6s` identik dengan preview pada waktu yang sama (template Pop Bounce dan One Word).
31. **Penyimpanan hasil edit memakai penjaga urutan (sequence).** Respons PUT yang lebih lama tidak boleh menimpa editan yang lebih baru — tanpa ini, dua penyimpanan debounce yang berdekatan bisa mengembalikan daftar kata lama.

## D8 — Style, template, preset, posisi (M6)

32. **Template bawaan di-seed sebagai baris `StylePreset` (id = templateId) saat server start.** Dengan begitu "jadikan default" berlaku seragam untuk template bawaan maupun preset pengguna tanpa tabel pengaturan tambahan. Preset default dipakai sebagai style awal proyek baru.
33. **`PUT /projects/:id/style` menormalkan semua nilai** (clamp ukuran, outline, posisi, warna hex) di server. UI tidak boleh menjadi satu-satunya penjaga validitas karena state bisa datang dari preset lama.
34. **Posisi disimpan dalam persen** (`posXPct`/`posYPct`), dihitung dari kotak video yang sedang tampil, dengan snap ke 50% bila dalam ±2%. Handle digeser sedikit ke atas dari titik anchor agar tidak menutupi teks, dengan garis penunjuk ke titik sebenarnya.
35. **Perubahan style disimpan dengan debounce 700 ms + penjaga urutan**, sama seperti transkrip. Preview diperbarui segera (tanpa menunggu server) agar terasa langsung.

## D9 — Polesan (M7)

36. **Pembatalan worker Python bersifat kooperatif.** Python dari venv berjalan sebagai proses cucu; `child.kill()` hanya menghentikan launcher dan `taskkill` tidak selalu tersedia. Karena itu API menulis `${DATA_DIR}/tmp/cancel-<jobId>.flag`, dan worker memeriksanya di antara segmen serta sebelum/sesudah memuat model. Untuk FFmpeg (proses anak langsung), kill tetap langsung.
37. **Saat server start, job `queued`/`running` ditandai `failed`** dan flag pembatalan ditulis untuk job transkripsi, sehingga worker yatim (bila ada) berhenti sendiri. Status proyek yang menggantung dikembalikan ke `uploaded`/`ready`.
38. **Pembersihan berkas sementara berbasis `mtime` + TTL** (`TEMP_TTL_DAYS`, default 7), berjalan saat start dan setiap 6 jam: isi `DATA_DIR/tmp`, folder `work*` per proyek, dan `output.tmp.mp4`. Folder kerja yang lebih muda dari 1 jam tidak disentuh agar job berjalan aman. `TEMP_TTL_DAYS=0` mematikan pembersihan.
39. **Peringatan lingkungan tampil di halaman `/`**: hasil `GET /health` yang berstatus `warn` (CUDA tidak siap, model belum diunduh) ditampilkan sebagai banner yang bisa ditutup, sesuai permintaan menampilkan peringatan fallback CPU di UI.
40. **Error job disimpan di `Job.error` dan ditampilkan apa adanya** di editor; tombol aksi tetap bisa dicoba ulang. Tidak ada exception filter global karena format default Nest (`statusCode`, `message`) sudah dipakai UI.
41. **Keterbatasan yang diterima (bukan bug):** HDR/10-bit jadi pucat karena `yuv420p`; reflow kata sekitar saat pop; preview single-thread tanpa header COOP/COEP; `large-v3` float16 butuh VRAM > 4 GB (pakai `int8_float16` atau model lebih kecil).

## D10 — Perbaikan preview video hitam (bug pasca-rilis)

42. **Renderer caption dibuat tepat satu kali.** Sebelumnya `ensureRenderer()` dipanggil dari `onMounted` *dan* dari watcher `ass`; karena pembuatan renderer asinkron (menunggu metadata video + impor WASM), dua panggilan bisa lolos pengecekan `instance` dan menghasilkan **dua instance JASSUB / dua kanvas WebGL** bertumpuk. Di sebagian GPU, konteks tambahan membuat kompositing video gagal sehingga video tampak hitam di balik caption (export tetap normal karena libass membakar caption langsung ke frame). Perbaikan: satu promise `creating` yang di-`await` bersama, `removeStrayCanvases()` untuk membersihkan kanvas yatim, dan `destroyRenderer()` yang menunggu `destroy()` JASSUB selesai.
43. **Hardening kompositing:** `.preview-video` diberi `transform: translateZ(0)` + `z-index: 0` dan `.video-box` diberi `isolation: isolate`, agar `<video>` berada di layer komposit sendiri dan tidak terkena bug *hardware overlay* Chromium saat kanvas WebGL ditumpuk di atasnya. Kanvas caption diberi `z-index: 1`.
44. **Preview default memakai renderer Canvas2D JASSUB, bukan WebGL.** Pada sebagian GPU/driver, kanvas WebGL JASSUB tampil **buram** sehingga menutupi `<video>` (gejala: caption muncul, video hitam, kontrol pemutar ikut hilang). Renderer Canvas2D memakai libass yang sama — hasil caption identik dengan export — tetapi komposisinya selalu mendukung alpha. Worker khusus (`apps/web/workers/jassub-canvas2d.js`) mematikan konteks WebGL di dalam worker sebelum modul JASSUB dievaluasi (patch harus berupa modul side-effect yang diimpor lebih dulu).
45. **Opsi diagnosa preview:** `?preview=webgl` memaksa WebGL, `?preview=auto` memilih berdasarkan uji alpha WebGL, dan default-nya Canvas2D. Backend yang dipakai ditulis ke `<html data-caption-renderer="webgl|canvas2d">` sehingga mudah diperiksa di DevTools. Bila renderer gagal atau tidak merespons dalam 12 detik, renderer otomatis dicoba ulang dengan Canvas2D; uji beban di lingkungan CPU-only menunjukkan 99 frame/4 detik tanpa frame drop.

## D11 — GPU transcription & log aplikasi (bug pasca-rilis)

46. **cuBLAS dipasang sebagai dependency Python, bukan diasumsikan dari driver.** ctranslate2 memuat `cublas64_12.dll` berdasarkan nama berkas dan tidak membawanya (berbeda dari cuDNN yang sudah ada di paket ctranslate2). Tanpa wheel `nvidia-cublas-cu12`, GPU selalu gagal dan worker jatuh ke CPU. Worker menambahkan `site-packages/nvidia/{cublas,cudnn}/bin` + folder `ctranslate2` ke `PATH` dan `os.add_dll_directory()` **sebelum** model dimuat. Bug awal: `site-packages` dihitung dari `dirname(dirname(ctranslate2.__file__))` sehingga satu tingkat terlalu dalam dan folder cuBLAS tidak pernah terdaftar.
47. **Urutan percobaan transkripsi:** `cuda` (sesuai `WHISPER_COMPUTE`) → `cuda/int8_float16` bila error pertama adalah kehabisan VRAM → `cpu/int8`. Percobaan int8 hanya dilakukan untuk OOM, supaya error lain (mis. cuBLAS tidak ada) tidak menambah percobaan yang sia-sia. Hasil: video 32 detik selesai ~3,6 detik di RTX 3050 4 GB dengan model `small`; audio 8 detik ~2,7 detik.
48. **Log aplikasi ditulis ke `DATA_DIR/logs/app.log`** lewat `FileLogger` yang membungkus `ConsoleLogger` (terminal tetap seperti biasa). Isinya: startup/route, job mulai, peringatan GPU, error job beserta traceback worker (ekor stderr), dan penyelesaian job. Tujuannya agar error bisa ditelusuri setelah kejadian tanpa menyalin output terminal. Berkas log tidak ikut TTL pembersihan.



