import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import path from 'node:path'
import type { VideoMeta } from '@acs/shared'
import { runCommand } from '../common/process'
import { APP_ENV } from '../config/env.module'
import type { AppEnv } from '../config/env'

interface FfprobeStream {
  index: number
  codec_name?: string
  codec_type?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
  duration?: string
  side_data_list?: Array<{ side_data_type?: string; rotation?: number }>
  tags?: Record<string, string>
}

interface FfprobeFormat {
  duration?: string
  format_name?: string
}

interface FfprobeOutput {
  streams?: FfprobeStream[]
  format?: FfprobeFormat
}

/** "30000/1001" → 29.97; "0/0" / tidak valid → null */
function parseRate(value: string | undefined): number | null {
  if (!value) return null
  const [numRaw, denRaw] = value.split('/')
  const num = Number(numRaw)
  const den = denRaw === undefined ? 1 : Number(denRaw)
  if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) return null
  const rate = num / den
  return Number.isFinite(rate) && rate > 0 ? Number(rate.toFixed(3)) : null
}

/** Normalisasi sudut rotasi ke 0/90/180/270. */
export function normalizeRotation(value: number | undefined | null): number {
  if (!value || !Number.isFinite(value)) return 0
  const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360
  return normalized
}

/** Ekstrak rotasi dari display matrix (side data) atau tag rotate lama. */
export function readRotation(stream: FfprobeStream): number {
  const matrix = stream.side_data_list?.find(
    (entry) => entry.side_data_type === 'Display Matrix' || entry.side_data_type === 'displaymatrix',
  )
  if (matrix && typeof matrix.rotation === 'number') return normalizeRotation(matrix.rotation)

  const tag = stream.tags?.rotate
  if (tag) return normalizeRotation(Number(tag))
  return 0
}

@Injectable()
export class FfprobeService {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  /** Baca metadata video; dimensi yang dikembalikan adalah dimensi tampilan (setelah rotasi). */
  async probe(filePath: string): Promise<VideoMeta> {
    const result = await runCommand(
      this.env.ffprobePath,
      ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', filePath],
      { logDir: this.env.tmpDir, timeoutMs: 60_000 },
    )

    if (result.code !== 0) {
      const detail = result.stderr.trim().split(/\r?\n/).slice(-3).join(' ')
      throw new BadRequestException(
        result.error === 'not-found'
          ? 'ffprobe tidak ditemukan; set FFPROBE_PATH.'
          : `Gagal membaca metadata video: ${detail || 'file tidak valid'}`,
      )
    }

    let parsed: FfprobeOutput
    try {
      parsed = JSON.parse(result.stdout) as FfprobeOutput
    } catch {
      throw new BadRequestException('Output ffprobe tidak dapat dibaca sebagai JSON.')
    }

    const streams = parsed.streams ?? []
    const video = streams.find((stream) => stream.codec_type === 'video')
    if (!video || !video.width || !video.height) {
      throw new BadRequestException('File tidak memiliki stream video yang didukung.')
    }

    const audio = streams.find((stream) => stream.codec_type === 'audio')
    const rotation = readRotation(video)

    // Dimensi tampilan: tukar lebar/tinggi jika rotasi 90/270.
    const swapped = rotation === 90 || rotation === 270
    const displayWidth = swapped ? video.height : video.width
    const displayHeight = swapped ? video.width : video.height

    const fps = parseRate(video.avg_frame_rate) ?? parseRate(video.r_frame_rate) ?? 30
    const durationCandidates = [parsed.format?.duration, video.duration, audio?.duration]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
    const durationSec = durationCandidates.length > 0 ? Math.max(...durationCandidates) : 0

    return {
      width: displayWidth,
      height: displayHeight,
      fps,
      durationSec: Number(durationSec.toFixed(3)),
      rotation,
      hasAudio: Boolean(audio),
      audioCodec: audio?.codec_name ?? null,
      videoCodec: video.codec_name ?? null,
    }
  }

  /** Ekstrak audio mono 16 kHz WAV (format yang dipakai faster-whisper). */
  async extractAudio(videoPath: string, outPath: string, signal?: AbortSignal): Promise<void> {
    const result = await runCommand(
      this.env.ffmpegPath,
      ['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', outPath],
      { logDir: this.env.tmpDir, signal, timeoutMs: 30 * 60_000, keepLogs: false },
    )
    if (result.code !== 0) {
      throw new Error(
        `Gagal mengekstrak audio: ${result.stderr.trim().split(/\r?\n/).slice(-3).join(' ')}`,
      )
    }
  }

  /** Path ekstensi berkas untuk header Content-Type. */
  static mimeFor(file: string): string {
    switch (path.extname(file).toLowerCase()) {
      case '.mov':
        return 'video/quicktime'
      case '.mkv':
        return 'video/x-matroska'
      case '.webm':
        return 'video/webm'
      case '.m4v':
        return 'video/x-m4v'
      case '.avi':
        return 'video/x-msvideo'
      default:
        return 'video/mp4'
    }
  }
}
