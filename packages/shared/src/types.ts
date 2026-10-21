/**
 * Tipe bersama untuk seluruh aplikasi.
 * Kontrak ini dipakai API (NestJS), Web (Nuxt), dan worker (via JSON).
 */

/** Satu kata dengan timestamp absolut (detik) dari awal video. */
export interface Word {
  id: string
  text: string
  /** detik */
  start: number
  /** detik */
  end: number
}

/** Daftar kata datar. Grup tidak disimpan; dihitung ulang dari kata + style. */
export interface Transcript {
  language: string
  words: Word[]
}

/** Grup caption hasil buildGroups(); hanya dipakai saat render. */
export interface CaptionGroup {
  words: Word[]
  start: number
  end: number
  /** teks yang ditampilkan (setelah uppercase/hidePunctuation) */
  displayText: string
}

/** Dimensi tampilan video (sudah memperhitungkan rotasi). */
export interface VideoMeta {
  width: number
  height: number
  fps: number
  durationSec: number
  /** 0/90/180/270; 90 dan 270 sudah ditukar pada width/height */
  rotation: number
  hasAudio: boolean
  audioCodec: string | null
  videoCodec: string | null
}

export interface StyleConfig {
  templateId: string
  /** nama family PERSIS seperti terbaca libass */
  fontFamily: string
  /** nama berkas di folder fonts */
  fontFile: string
  /** % dari sisi terpendek video (min(W,H)), default 6.5 */
  fontSizePct: number
  uppercase: boolean
  /** sembunyikan tanda baca saat tampil (grouping tetap memakai teks asli) */
  hidePunctuation: boolean
  /** "#FFFFFF" */
  textColor: string
  /** "#7FFFD4" aquamarine */
  activeColor: string
  /** "#000000" */
  outlineColor: string
  /** % dari ukuran font, default 12 */
  outlinePct: number
  /** % dari ukuran font, default 4 */
  shadowPct: number
  maxWordsPerGroup: number
  /** jeda antar kata (detik) yang memicu grup baru */
  maxGapSec: number
  /** % lebar video */
  maxWidthPct: number
  /** puncak pop, default 115 (100 = tanpa pop) */
  popScalePct: number
  /** awal pop, default 85 */
  popStartScalePct: number
  /** total naik + turun, default 180 ms */
  popDurationMs: number
  /** default 50 */
  posXPct: number
  /** default 72 */
  posYPct: number
}

export type Language = 'en' | 'id' | 'auto'

export const LANGUAGES: readonly Language[] = ['en', 'id', 'auto'] as const

export type TemplateId = 'pop-bounce' | 'karaoke-highlight' | 'one-word' | 'clean-subtitle'

export type ProjectStatus =
  | 'uploaded'
  | 'transcribing'
  | 'ready'
  | 'exporting'
  | 'error'

export type JobType = 'transcribe' | 'export'

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled'

export interface ProjectDto {
  id: string
  title: string
  originalName: string
  width: number
  height: number
  fps: number
  durationSec: number
  hasAudio: boolean
  audioCodec: string | null
  language: string
  status: ProjectStatus
  transcript: Transcript | null
  style: StyleConfig | null
  createdAt: string
  updatedAt: string
}

export interface JobDto {
  id: string
  projectId: string
  type: JobType
  status: JobStatus
  /** 0..1 */
  progress: number
  error: string | null
  createdAt: string
  finishedAt: string | null
}

export interface StylePresetDto {
  id: string
  name: string
  isBuiltIn: boolean
  isDefault: boolean
  config: StyleConfig
}

export interface FontInfo {
  family: string
  file: string
}

export interface HealthCheck {
  name: string
  ok: boolean
  /** ringkas untuk UI */
  status: 'ok' | 'warn' | 'error'
  detail: string
  /** nilai mentah opsional, mis. versi */
  version?: string | null
}

export interface HealthReport {
  ok: boolean
  checkedAt: string
  checks: HealthCheck[]
  env: {
    dataDir: string
    fontsDir: string
    whisperModel: string
    whisperDevice: string
    whisperCompute: string
    ffmpegPath: string
    ffprobePath: string
    pythonPath: string | null
  }
}
