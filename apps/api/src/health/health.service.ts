import { Inject, Injectable } from '@nestjs/common'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_STYLE, type HealthCheck, type HealthReport } from '@acs/shared'
import { runCommand } from '../common/process'
import { APP_ENV } from '../config/env.module'
import type { AppEnv } from '../config/env'

const PY_THW = `
import json, sys
info = {}
try:
    import faster_whisper, ctranslate2
    info['fasterWhisper'] = getattr(faster_whisper, '__version__', 'unknown')
    info['ctranslate2'] = getattr(ctranslate2, '__version__', 'unknown')
    try:
        info['cudaDevices'] = int(ctranslate2.get_cuda_device_count())
    except Exception:
        info['cudaDevices'] = 0
except Exception as exc:
    info['error'] = f'{type(exc).__name__}: {exc}'
print(json.dumps(info))
`

function firstLine(text: string): string {
  return (text || '').split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? ''
}

/**
 * Verifikasi dependensi eksternal: FFmpeg, ffprobe, NVENC, Python,
 * faster-whisper/ctranslate2, CUDA, model Whisper, dan folder font.
 */
@Injectable()
export class HealthService {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  private run(command: string, args: string[], timeoutMs = 15_000) {
    return runCommand(command, args, { logDir: this.env.tmpDir, timeoutMs })
  }

  async check(): Promise<HealthReport> {
    const checks = await Promise.all([
      this.checkFfmpeg(),
      this.checkFfprobe(),
      this.checkNvenc(),
      this.checkPython(),
      this.checkWhisper(),
      this.checkCuda(),
      this.checkModel(),
      this.checkFonts(),
    ])

    return {
      ok: checks.every((check) => check.status !== 'error'),
      checkedAt: new Date().toISOString(),
      checks,
      env: {
        dataDir: this.env.dataDir,
        fontsDir: this.env.fontsDir,
        whisperModel: this.env.whisperModel,
        whisperDevice: this.env.whisperDevice,
        whisperCompute: this.env.whisperCompute,
        ffmpegPath: this.env.ffmpegPath,
        ffprobePath: this.env.ffprobePath,
        pythonPath: this.env.pythonPath,
      },
    }
  }

  private async checkFfmpeg(): Promise<HealthCheck> {
    const result = await this.run(this.env.ffmpegPath, ['-version'])
    if (result.code !== 0) {
      return {
        name: 'FFmpeg',
        ok: false,
        status: 'error',
        detail: result.error === 'not-found' ? 'tidak ditemukan di PATH' : firstLine(result.stderr),
      }
    }
    const line = firstLine(result.stdout)
    const version = /ffmpeg version (\S+)/.exec(line)?.[1] ?? line
    return { name: 'FFmpeg', ok: true, status: 'ok', detail: 'tersedia', version }
  }

  private async checkFfprobe(): Promise<HealthCheck> {
    const result = await this.run(this.env.ffprobePath, ['-version'])
    if (result.code !== 0) {
      return {
        name: 'ffprobe',
        ok: false,
        status: 'error',
        detail: result.error === 'not-found' ? 'tidak ditemukan di PATH' : firstLine(result.stderr),
      }
    }
    const version = /ffprobe version (\S+)/.exec(firstLine(result.stdout))?.[1] ?? null
    return { name: 'ffprobe', ok: true, status: 'ok', detail: 'tersedia', version }
  }

  private async checkNvenc(): Promise<HealthCheck> {
    const encoders = await this.run(this.env.ffmpegPath, ['-hide_banner', '-encoders'])
    if (encoders.code !== 0) {
      return {
        name: 'NVENC',
        ok: false,
        status: 'error',
        detail: 'tidak dapat membaca daftar encoder FFmpeg',
      }
    }
    if (!encoders.stdout.includes('h264_nvenc')) {
      return {
        name: 'NVENC',
        ok: false,
        status: 'warn',
        detail: 'h264_nvenc tidak ada; export memakai libx264 (CPU)',
      }
    }

    // Uji encode singkat: encoder ada belum tentu driver/GPU siap.
    const test = await this.run(
      this.env.ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=256x256:d=0.2',
        '-frames:v',
        '2',
        '-c:v',
        'h264_nvenc',
        '-f',
        'null',
        '-',
      ],
      30_000,
    )
    if (test.code !== 0) {
      return {
        name: 'NVENC',
        ok: false,
        status: 'warn',
        detail: `encode uji gagal: ${firstLine(test.stderr) || 'unknown error'}`,
      }
    }
    return { name: 'NVENC', ok: true, status: 'ok', detail: 'h264_nvenc siap dipakai' }
  }

  private async checkPython(): Promise<HealthCheck> {
    const result = await this.run(this.env.pythonPath, ['--version'])
    if (result.code !== 0) {
      return {
        name: 'Python',
        ok: false,
        status: 'error',
        detail:
          result.error === 'not-found'
            ? `${this.env.pythonPath} tidak ditemukan (jalankan pnpm setup:py)`
            : firstLine(result.stderr) || 'gagal menjalankan python',
        version: null,
      }
    }
    const version = /Python (\S+)/.exec(firstLine(result.stdout) + firstLine(result.stderr))?.[1] ?? null
    return { name: 'Python', ok: true, status: 'ok', detail: this.env.pythonPath, version }
  }

  private async probePythonInfo(): Promise<Record<string, unknown> | null> {
    const result = await this.run(this.env.pythonPath, ['-c', PY_THW], 60_000)
    if (result.code !== 0) return null
    try {
      return JSON.parse(result.stdout.trim().split(/\r?\n/).pop() ?? '{}') as Record<string, unknown>
    } catch {
      return null
    }
  }

  private async checkWhisper(): Promise<HealthCheck> {
    const info = await this.probePythonInfo()
    const version = (info?.fasterWhisper as string | undefined) ?? null
    if (!info || info.error) {
      return {
        name: 'faster-whisper',
        ok: false,
        status: 'error',
        detail: `belum terpasang (jalankan pnpm setup:py). ${String(info?.error ?? '')}`.trim(),
        version: null,
      }
    }
    return {
      name: 'faster-whisper',
      ok: true,
      status: 'ok',
      detail: `ctranslate2 ${String(info.ctranslate2 ?? '?')}`,
      version,
    }
  }

  private async checkCuda(): Promise<HealthCheck> {
    const info = await this.probePythonInfo()
    const devices = Number(info?.cudaDevices ?? 0)
    if (!info || info.error) {
      return {
        name: 'CUDA',
        ok: false,
        status: 'warn',
        detail: 'ctranslate2 belum terpasang; GPU belum bisa diverifikasi',
      }
    }
    if (this.env.whisperDevice === 'cpu') {
      return { name: 'CUDA', ok: true, status: 'ok', detail: 'WHISPER_DEVICE=cpu (disengaja)' }
    }
    if (devices > 0) {
      return { name: 'CUDA', ok: true, status: 'ok', detail: `${devices} GPU terdeteksi` }
    }
    return {
      name: 'CUDA',
      ok: false,
      status: 'warn',
      detail: 'GPU tidak terdeteksi; transkripsi memakai CPU int8 (lebih lambat)',
    }
  }

  private async checkModel(): Promise<HealthCheck> {
    const model = this.env.whisperModel
    const looksLikePath = path.isAbsolute(model) || model.includes('/') || model.includes('\\')
    if (looksLikePath) {
      const dir = path.isAbsolute(model) ? model : path.resolve(this.env.repoRoot, model)
      const ok = fs.existsSync(path.join(dir, 'model.bin'))
      return {
        name: 'Model Whisper',
        ok,
        status: ok ? 'ok' : 'error',
        detail: ok ? dir : `model tidak ditemukan di ${dir}`,
      }
    }

    const candidates = [
      path.join(this.env.modelsDir, 'hub', `models--Systran--faster-whisper-${model}`),
      path.join(this.env.modelsDir, `models--Systran--faster-whisper-${model}`),
    ]
    const found = candidates.find((dir) => {
      if (!fs.existsSync(dir)) return false
      const snapshots = path.join(dir, 'snapshots')
      if (!fs.existsSync(snapshots)) return false
      return fs
        .readdirSync(snapshots)
        .some((snapshot) => fs.existsSync(path.join(snapshots, snapshot, 'model.bin')))
    })

    if (found) {
      return { name: 'Model Whisper', ok: true, status: 'ok', detail: `${model} siap`, version: model }
    }
    return {
      name: 'Model Whisper',
      ok: false,
      status: 'warn',
      detail: `${model} belum diunduh (otomatis saat transkripsi pertama, ±3 GB untuk large-v3)`,
      version: model,
    }
  }

  private checkFonts(): HealthCheck {
    let files: string[] = []
    try {
      files = fs
        .readdirSync(this.env.fontsDir)
        .filter((file) => /\.(ttf|otf)$/i.test(file))
        .sort()
    } catch {
      files = []
    }
    const expected = DEFAULT_STYLE.fontFile
    const hasDefault = files.includes(expected)
    if (files.length === 0) {
      return {
        name: 'Font',
        ok: false,
        status: 'error',
        detail: `folder font kosong: ${this.env.fontsDir}`,
      }
    }
    return {
      name: 'Font',
      ok: hasDefault,
      status: hasDefault ? 'ok' : 'warn',
      detail: hasDefault ? `${files.length} font (default ${expected})` : `${expected} tidak ada; ${files.length} font lain tersedia`,
    }
  }
}
