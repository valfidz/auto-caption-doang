# Guidance untuk AI Agent — Auto Caption Studio

*Dokumen kerja untuk AI coding agent · Pasangan dari PRD "Auto Caption Studio" · 20 Oktober 2026*

## 0. Aturan kerja untuk agent

- Baca PRD terlebih dahulu. Kerjakan milestone **berurutan M0 → M7**. Setelah tiap milestone: jalankan test, jelaskan cara memverifikasi secara manual, lalu commit.
- Jangan menambah fitur di luar PRD. Jika ada ambiguitas, pilih asumsi paling sederhana yang sesuai PRD dan catat di `DECISIONS.md`.
- **Satu sumber kebenaran untuk tampilan caption:** paket `packages/shared` (grouping + generator ASS). Web (preview) dan API (export) wajib memakai kode yang sama.
- Kode harus berjalan di Windows dan Linux: pakai `path.join`, jangan hardcode path, ambil lokasi FFmpeg/Python/model dari environment variable.
- Semua pemrosesan lokal. Jangan memanggil layanan eksternal.

## 1. Konteks singkat

Tools web lokal untuk caption otomatis bergaya CapCut: transkripsi dengan timestamp per kata → caption maks 4 kata per layar, kata yang diucapkan berwarna aquamarine dengan efek pop → export MP4 burn-in. Pengguna tunggal, GPU NVIDIA tersedia, bahasa utama Inggris (kadang Indonesia).

## 2. Stack

| Lapisan | Pilihan | Catatan |
|---|---|---|
| Frontend | Nuxt 3 (Vue 3, TypeScript), Pinia | Mode SPA (`ssr: false`); JASSUB hanya di client |
| Backend | NestJS (TypeScript) | REST + runner job di dalam proses |
| Database | Prisma + SQLite | JSON disimpan sebagai `String` |
| Transkripsi | Python 3.10+, faster-whisper, model `large-v3` | CUDA; fallback CPU lewat env |
| Render | FFmpeg + libass, encoder NVENC | fallback libx264 |
| Preview | JASSUB (libass WASM) | ikuti dokumentasi versi yang terpasang |
| Shared | `packages/shared` (TypeScript) | tipe, grouping, generator ASS, pengukur teks |
| Test | Vitest | unit + golden file |
| Tooling | pnpm workspaces | monorepo |

## 3. Struktur repo

```
auto-caption-studio/
  apps/
    web/            # Nuxt 3
    api/            # NestJS
  workers/
    transcriber/    # transcribe.py, requirements.txt
  packages/
    shared/         # types, grouping, ass, measure, templates
  assets/
    fonts/          # Montserrat-ExtraBold.ttf, dst. (juga dilayani ke web)
  data/             # DATA_DIR default (di-gitignore)
  DECISIONS.md
```

## 4. Environment variable

`DATABASE_URL`, `DATA_DIR`, `FFMPEG_PATH` (default `ffmpeg`), `FFPROBE_PATH` (default `ffprobe`), `PYTHON_PATH`, `WHISPER_MODEL` (default `large-v3`), `WHISPER_DEVICE` (`cuda`/`cpu`), `WHISPER_COMPUTE` (`float16`/`int8`), `FONTS_DIR`, `TEMP_TTL_DAYS` (default 7), `PORT`.

## 5. Alur data

1. **Upload** → stream langsung ke disk di `DATA_DIR/projects/<id>/source.<ext>` (jangan buffer di memori) → `ffprobe` → buat baris `Project`.
2. **Transkripsi (job):** ekstrak audio → worker Python → `transcript.json` → simpan ke `Project.transcriptJson`.
3. **Editor:** web memuat project, transcript, dan style. Web membuat ASS untuk preview dengan paket shared.
4. **Export (job):** API membuat `captions.ass` dari transcript + style tersimpan (paket shared yang sama) → FFmpeg → `output.mp4`.

Perintah penting:

```
ffprobe -v error -print_format json -show_streams -show_format <input>
ffmpeg -y -i <input> -vn -ac 1 -ar 16000 -c:a pcm_s16le audio.wav
```

Dimensi tampilan video = lebar/tinggi stream video, **ditukar jika ada rotasi 90/270** (cek `side_data_list` displaymatrix atau tag `rotate`). Semua perhitungan caption memakai dimensi tampilan ini.

## 6. Skema data dan kontrak

### 6.1 Prisma (SQLite)

```prisma
model Project {
  id             String   @id @default(cuid())
  title          String
  originalName   String
  videoPath      String
  width          Int      // dimensi tampilan (setelah rotasi)
  height         Int
  fps            Float
  durationSec    Float
  hasAudio       Boolean  @default(true)
  audioCodec     String?
  language       String   @default("en")
  transcriptJson String?  // JSON: Transcript
  styleJson      String?  // JSON: StyleConfig
  status         String   @default("uploaded") // uploaded|transcribing|ready|exporting|error
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  jobs           Job[]
}

model Job {
  id         String    @id @default(cuid())
  projectId  String
  project    Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  type       String    // transcribe | export
  status     String    @default("queued") // queued|running|done|failed|canceled
  progress   Float     @default(0)
  error      String?
  outputPath String?
  createdAt  DateTime  @default(now())
  finishedAt DateTime?
}

model StylePreset {
  id         String  @id @default(cuid())
  name       String
  isBuiltIn  Boolean @default(false)
  isDefault  Boolean @default(false)
  configJson String
}
```

### 6.2 Transcript

```ts
interface Word { id: string; text: string; start: number; end: number } // detik
interface Transcript { language: string; words: Word[] }
```

Disimpan sebagai daftar kata datar. **Grup tidak disimpan**; grup dihitung ulang dari kata + style setiap kali ada perubahan. Aturan edit: *gabung* = teks digabung, `start` kata pertama, `end` kata terakhir; *pisah* = bagi durasi proporsional dengan jumlah karakter; *hapus* = kata dibuang; *sisip* = durasi minimal 0,2 detik di celah yang tersedia.

### 6.3 StyleConfig

```ts
interface StyleConfig {
  templateId: string;
  fontFamily: string;        // nama family PERSIS seperti terbaca libass
  fontFile: string;          // nama berkas di folder fonts
  fontSizePct: number;       // % dari sisi terpendek video (min(W,H)), default 6.5
  uppercase: boolean;
  hidePunctuation: boolean;  // sembunyikan tanda baca saat tampil (grouping tetap memakai teks asli)
  textColor: string;         // "#FFFFFF"
  activeColor: string;       // "#7FFFD4" (aquamarine)
  outlineColor: string;      // "#000000"
  outlinePct: number;        // % dari ukuran font, default 12
  shadowPct: number;         // % dari ukuran font, default 4
  maxWordsPerGroup: number;  // default 4
  maxGapSec: number;         // default 0.5
  maxWidthPct: number;       // default 80 (% lebar video)
  popScalePct: number;       // puncak pop, default 115 (100 = tanpa pop)
  popStartScalePct: number;  // awal pop, default 85
  popDurationMs: number;     // total naik + turun, default 180
  posXPct: number;           // default 50
  posYPct: number;           // default 72
}
```

## 7. API (REST)

- `POST /projects` (multipart) → buat proyek; `GET /projects`; `GET /projects/:id`; `DELETE /projects/:id`
- `GET /projects/:id/video` → stream video **dengan dukungan HTTP Range** (wajib agar seek di preview berfungsi)
- `POST /projects/:id/transcribe` body `{ language: "en" | "id" | "auto" }` → `Job`
- `PUT /projects/:id/transcript`; `PUT /projects/:id/style`
- `POST /projects/:id/export` → `Job`; `GET /projects/:id/export/download`
- `GET /jobs/:id` (polling) atau SSE `GET /jobs/:id/events`; `POST /jobs/:id/cancel`
- `GET /presets`; `POST /presets`; `DELETE /presets/:id`; `PUT /presets/:id/default`
- `GET /fonts` → daftar `{ family, file }`; berkas font dilayani statis agar web bisa memuat font yang sama

**Runner job:** antrean sederhana di memori, satu job berjalan pada satu waktu. Saat server start, job `running` ditandai `failed` (terinterupsi). Proses eksternal dijalankan dengan `spawn` dan dapat dibatalkan (kill). Hapus berkas sementara setelah selesai atau gagal.

## 8. Worker transkripsi

`python transcribe.py --audio audio.wav --language en|id|auto --out transcript.json`

```python
from faster_whisper import WhisperModel
model = WhisperModel(MODEL, device=DEVICE, compute_type=COMPUTE)
segments, info = model.transcribe(
    audio, language=None if lang == "auto" else lang,
    word_timestamps=True, vad_filter=True,
    vad_parameters=dict(min_silence_duration_ms=300),
    beam_size=5, condition_on_previous_text=False)
```

- Cetak progres sebagai JSON per baris di stdout: `{"type":"progress","value":0.42}` (nilai = `segment.end / info.duration`), dan `{"type":"done"}` di akhir. Error dicetak sebagai `{"type":"error","message":"..."}` dengan exit code bukan nol.
- Normalisasi kata: `strip()` spasi, buang kata kosong, pastikan `end > start` (minimal 20 ms) dan urutan waktu naik monoton. **Pertahankan tanda baca menempel pada kata** (dipakai untuk mendeteksi akhir kalimat).
- Jika CUDA tidak tersedia, gunakan `cpu` + `int8` dan tampilkan peringatan di UI.

## 9. Pengelompokan (grouping)

```
function buildGroups(words, style, video, measure):
  groups = []; cur = []
  for w in words:
    if cur not empty:
      gap = w.start - last(cur).end
      if gap > maxGapSec
         or len(cur) >= maxWordsPerGroup
         or endsSentence(last(cur))                 // . ? ! …
         or (endsComma(last(cur)) and len(cur) >= 2) // koma = pemecah lunak
         or measure(textOf(cur + [w])) > maxWidthPct/100 * video.width:
        groups.push(cur); cur = []
    cur.push(w)
  flush cur
  return groups
```

- Pengukuran teks (`measure`) memakai **teks yang benar-benar ditampilkan** (setelah uppercase dan hide punctuation) pada ukuran font piksel sebenarnya, ditambah ruang untuk outline.
- Implementasi `measure` ada di `packages/shared` memakai `opentype.js` (jalan di browser dan Node) dengan berkas font yang sama. Ini penting agar grup di preview dan export identik.
- Satu kata yang melebihi lebar maksimum tetap ditampilkan sebagai grup sendiri.

## 10. Generator ASS (`packages/shared`)

Fungsi: `generateAss(groups, style, video): string`.

**Header**

```
[Script Info]
ScriptType: v4.00+
PlayResX: <video.width>
PlayResY: <video.height>
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,<fontFamily>,<fontSizePx>,<textColor>,&H00FFFFFF,<outlineColor>,&H00000000,0,0,0,0,100,100,0,0,1,<outlinePx>,<shadowPx>,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
```

- `fontSizePx = round(min(W,H) * fontSizePct / 100)`; `outlinePx = fontSizePx * outlinePct / 100`; `shadowPx = fontSizePx * shadowPct / 100`.
- Warna ASS berformat `&HAABBGGRR` (urutan BGR, alpha `00` = buram). Aquamarine `#7FFFD4` → `&H00D4FF7F`; putih → `&H00FFFFFF`.
- Nama font harus **persis sama** dengan family name di berkas font (cek dengan `fc-scan` atau library font). Untuk font statis seperti "Montserrat ExtraBold", gunakan `Bold=0` dan nama family tersebut; verifikasi lewat render nyata.

**Event per kata (Mode A)**

Untuk setiap kata ke-*i* dalam grup dibuat satu `Dialogue` yang menampilkan **seluruh kata grup**, dengan kata ke-*i* diberi tag aktif:

```
Dialogue: 0,0:00:03.20,0:00:03.58,Default,,0,0,0,,{\an5\pos(540,1382)}WHAT {\c&H00D4FF7F&\fscx85\fscy85\t(0,90,\fscx115\fscy115)\t(90,180,\fscx100\fscy100)}ARE{\c&H00FFFFFF&\fscx100\fscy100} YOU DOING
```

- `\an5\pos(x,y)`: titik tengah teks; `x = round(W * posXPct/100)`, `y = round(H * posYPct/100)`.
- Setelah kata aktif, **kembalikan warna dan skala secara eksplisit** (jangan memakai `\r`) agar posisi/alignment tidak ikut ter-reset.
- Animasi: `\t(0, d/2, \fscx{popScale}\fscy{popScale})` lalu `\t(d/2, d, \fscx100\fscy100)` dengan `d = min(popDurationMs, durasi event)`. Jika `popScalePct = 100`, lewati animasi dan skala awal.
- Waktu: `start = word.start`; `end = word berikutnya.start` (menyambung tanpa celah di dalam grup); untuk kata terakhir `end = word.end + 0.15 s`, tetapi tidak boleh melewati `start` grup berikutnya. Durasi minimal event 40 ms.
- Format waktu ASS `H:MM:SS.cc` (centisecond). Hitung dari detik absolut dengan pembulatan `round(sec * 100)` per event agar tidak menumpuk selisih.
- Escape teks: ganti `{` dan `}` dengan `(` dan `)`, hapus baris baru. Terapkan uppercase dan hide punctuation sebelum menyusun teks.

**Keterbatasan yang diketahui (reflow):** saat kata aktif membesar, kata di sebelahnya bisa sedikit bergeser. MVP menerimanya (skala pop moderat). Perbaikan pasca-MVP: posisikan tiap kata sendiri dengan `\pos` memakai lebar dari `measure`.

## 11. Export dengan FFmpeg

Buat direktori kerja sementara berisi `captions.ass`, folder `fonts/` (salinan font yang dipakai), lalu jalankan FFmpeg dengan **cwd = direktori kerja** dan path relatif. Ini menghindari masalah escape path Windows (titik dua, backslash) pada filter `ass`.

```
ffmpeg -y -i <input> -vf "ass=captions.ass:fontsdir=fonts" \
  -c:v h264_nvenc -preset p5 -rc vbr -cq 21 -b:v 0 -pix_fmt yuv420p \
  -c:a copy -movflags +faststart -progress pipe:1 -nostats <output.mp4>
```

- **Fallback CPU:** `-c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p` bila NVENC gagal/tidak tersedia (deteksi lewat `ffmpeg -encoders` atau kegagalan awal).
- **Audio:** `-c:a copy` hanya jika codec kompatibel dengan MP4 (aac, mp3). Selain itu, transcode ke `-c:a aac -b:a 192k`. Jika tidak ada audio, jangan sertakan opsi audio.
- Resolusi dan fps mengikuti sumber (jangan ubah fps; waspadai video VFR).
- Progres: parse `out_time_us` / `out_time_ms` dari `-progress pipe:1` dibagi durasi total.

## 12. Preview dengan JASSUB

- Pasang paket `jassub`; muat sebagai client-only plugin Nuxt. Sajikan worker dan berkas WASM dari `public/` sesuai dokumentasi versi terpasang.
- Inisialisasi dengan elemen `<video>`, isi ASS (string), dan daftar font (URL dari `/fonts`). Setiap perubahan transcript/style: buat ulang ASS dengan paket shared (debounce ±100 ms), lalu ganti track pada renderer.
- Pastikan font sudah termuat sebelum menghitung `measure` dan sebelum render pertama.
- Preview harus identik dengan hasil export; bandingkan secara berdampingan pada beberapa timestamp (lihat bagian pengujian).

## 13. Editor (UI)

- Halaman `/` : daftar proyek + unggah (drag-and-drop), pilihan bahasa (English default / Indonesia / Auto), tombol mulai transkripsi dengan progres.
- Halaman `/p/:id` : tiga area — preview video dengan kontrol putar dan seek; panel kanan dengan tab **Captions** dan **Style**; bilah atas dengan status dan tombol **Export**.
- **Captions:** daftar grup; klik untuk loncat ke waktu; edit teks kata inline; aksi gabung/pisah/hapus kata; grup/kata yang sedang aktif tersorot saat video diputar. Pintasan: Space (putar/jeda), panah kiri/kanan (±1 detik).
- **Style:** pilihan template, preset tersimpan (simpan/hapus/jadikan default), kontrol font, ukuran, warna teks, warna highlight, outline, shadow, uppercase, hide punctuation, maks kata per layar, skala pop, dan pengaturan pemecahan grup.
- **Posisi:** handle drag di atas preview; ubah koordinat piksel layar menjadi persen berdasarkan ukuran tampil video; snap ke tengah horizontal. Simpan sebagai `posXPct`/`posYPct`.
- Penyimpanan otomatis (debounce) untuk transcript dan style; tampilkan status tersimpan/gagal.
- Export: tombol memulai job, tampilkan progres, tombol unduh saat selesai, dan pesan error yang jelas bila gagal.

## 14. Template bawaan (konfigurasi `StyleConfig`)

Semua template hanyalah preset `StyleConfig`. Default "Pop Bounce":

```json
{"templateId":"pop-bounce","fontFamily":"Montserrat ExtraBold","fontFile":"Montserrat-ExtraBold.ttf","fontSizePct":6.5,"uppercase":true,"hidePunctuation":true,"textColor":"#FFFFFF","activeColor":"#7FFFD4","outlineColor":"#000000","outlinePct":12,"shadowPct":4,"maxWordsPerGroup":4,"maxGapSec":0.5,"maxWidthPct":80,"popScalePct":115,"popStartScalePct":85,"popDurationMs":180,"posXPct":50,"posYPct":72}
```

| Template | Beda dari Pop Bounce |
|---|---|
| `karaoke-highlight` | `popScalePct=100`, `popStartScalePct=100` |
| `one-word` | `maxWordsPerGroup=1`, `fontSizePct=10`, `posYPct=60` |
| `clean-subtitle` | `activeColor=textColor`, pop nonaktif, `maxWordsPerGroup=8`, `maxWidthPct=85`, `uppercase=false`, `outlinePct=8` |
| `box-highlight` | **Pasca-MVP** (butuh kotak per kata; jangan dikerjakan di MVP) |

Sediakan font `Montserrat-ExtraBold.ttf` (open source). Font The Bold Font dan Komika Axis bersifat opsional dan hanya dipasang oleh pengguna sendiri di `assets/fonts`; daftar font dibaca otomatis dari folder.

## 15. Milestone dan kriteria selesai

- **M0 — Setup.** Monorepo pnpm, lint, Vitest, endpoint cek kesehatan yang memverifikasi FFmpeg, ffprobe, Python, CUDA, dan model. *Selesai jika:* satu perintah menampilkan status semua dependensi.
- **M1 — Upload dan probe.** Upload streaming, `ffprobe`, dimensi tampilan memperhitungkan rotasi, Project tersimpan, video dapat diputar (Range). *Selesai jika:* video 9:16 ponsel yang dirotasi menghasilkan width/height tampilan yang benar.
- **M2 — Transkripsi.** Runner job, worker Python, progres, transcript tersimpan. *Selesai jika:* video Inggris 60 detik menghasilkan kata dengan timestamp monoton dan tidak ada kata berdurasi nol.
- **M3 — Grouping dan ASS.** Paket shared dengan unit test dan golden file ASS. *Selesai jika:* test lulus untuk 9:16, 16:9, 1:1 dan kasus jeda panjang, kalimat panjang, serta kata sangat panjang.
- **M4 — Export.** Job export dengan progres, NVENC + fallback CPU, penanganan audio. *Selesai jika:* MP4 hasil memperlihatkan caption yang benar dan sinkron di pemutar biasa.
- **M5 — Editor dasar.** Preview JASSUB, daftar caption, edit teks, auto-save. *Selesai jika:* edit satu kata langsung tercermin di preview dan di hasil export.
- **M6 — Style dan template.** Panel style, template, preset, drag posisi. *Selesai jika:* ganti template dan geser posisi mengubah preview dan export secara identik.
- **M7 — Polesan.** Penanganan error, pembatalan job, pembersihan berkas sementara, uji sampel sulit (VFR, rotasi, tanpa audio, bahasa Indonesia). *Selesai jika:* seluruh daftar pengujian di bawah lulus.

## 16. Pengujian

- **Unit (Vitest):** grouping (batas kata, jeda, tanda baca, lebar), konversi warna ASS, format waktu ASS, escape teks, normalisasi kata.
- **Golden file:** keluaran `generateAss` untuk transcript sampel dibandingkan dengan berkas acuan.
- **Sampel video:** 9:16 1080×1920, 16:9 1920×1080, 1:1, video ponsel dengan metadata rotasi, rekaman layar VFR, video tanpa audio, audio non-AAC (mis. WebM/Opus), contoh bahasa Indonesia dan Inggris.
- **Visual:** ambil frame hasil export (`ffmpeg -ss <t> -i out.mp4 -frames:v 1 frame.png`) pada beberapa timestamp dan bandingkan dengan preview pada waktu yang sama.

## 17. Jebakan yang sering terlewat

- Nama font tidak cocok → libass diam-diam memakai font pengganti. Selalu verifikasi dengan render nyata.
- Path Windows pada filter `ass` → gunakan cwd + path relatif (bagian 11).
- `PlayResX/Y` harus sama dengan dimensi **tampilan** video (setelah rotasi), bukan dimensi mentah.
- Pembulatan waktu ASS menumpuk jika dihitung relatif; hitung dari detik absolut.
- Whisper bisa berhalusinasi pada keheningan → pakai VAD, dan pertimbangkan membuang kata di luar rentang suara.
- Uppercase harus diterapkan **sebelum** pengukuran lebar, jika tidak teks bisa melebar melewati layar.
- Karakter `{` dan `}` di teks merusak override tag ASS → escape.
- Upload besar: stream ke disk, naikkan batas body, dan jangan baca seluruh file ke memori.
- Video HDR/10-bit: output dipaksa `yuv420p`, warna bisa terlihat pucat; catat sebagai keterbatasan, bukan bug.
- Proses yatim setelah restart server → tandai job terinterupsi dan pastikan child process di-kill.

## 18. Di luar cakupan (jangan dikerjakan)

Login/multi-user, deployment publik, penyuntingan video (trim/efek/musik), terjemahan, emoji otomatis, B-roll, template berkotak per kata, ekspor SRT/ASS, batch processing, dan geser timing per kata (semuanya pasca-MVP kecuali disebut lain di PRD).
