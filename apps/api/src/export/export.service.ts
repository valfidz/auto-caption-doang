import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Project as ProjectRow } from '@prisma/client'
import {
  createFallbackMeasurer,
  createMeasurer,
  DEFAULT_STYLE,
  buildGroups,
  generateAss,
  type Measurer,
  type StyleConfig,
  type Transcript,
} from '@acs/shared'
import { runCommand } from '../common/process'
import { APP_ENV } from '../config/env.module'
import type { AppEnv } from '../config/env'
import { JobsService, type JobRunnerContext } from '../jobs/jobs.service'
import { PrismaService } from '../prisma/prisma.module'
import { parseStyle, parseTranscript } from '../projects/project.mapper'
import { ProjectsService } from '../projects/projects.service'
import { StorageService } from '../projects/storage.service'

/** Codec audio yang bisa dicopy langsung ke MP4 tanpa re-encode. */
const COPYABLE_AUDIO = new Set(['aac', 'mp3'])

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name)
  private readonly measurers = new Map<string, Measurer>()
  private nvencAvailable: boolean | null = null

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly projects: ProjectsService,
    private readonly storage: StorageService,
  ) {}

  async start(projectId: string): Promise<import('@acs/shared').JobDto> {
    const project = await this.projects.getRow(projectId)
    const transcript = parseTranscript(project.transcriptJson)
    if (!transcript || transcript.words.length === 0) {
      throw new BadRequestException('Transkripsi dulu sebelum export.')
    }
    const active = await this.jobs.findActive(projectId, 'export')
    if (active) throw new ConflictException('Export untuk proyek ini sedang berjalan.')

    return this.jobs.enqueue({
      projectId,
      type: 'export',
      run: (context) => this.run(project, context),
    })
  }

  private async run(project: ProjectRow, context: JobRunnerContext): Promise<{ outputPath: string }> {
    const transcript = parseTranscript(project.transcriptJson)
    if (!transcript) throw new Error('Transkrip hilang dari database.')

    const style: StyleConfig = parseStyle(project.styleJson) ?? DEFAULT_STYLE
    const video = { width: project.width, height: project.height }
    const videoPath = this.storage.resolveDataPath(project.videoPath)
    const projectDir = this.storage.projectDir(project.id)
    const workDir = path.join(projectDir, `work-export-${randomUUID()}`)
    const assPath = path.join(workDir, 'captions.ass')
    const fontsDir = path.join(workDir, 'fonts')
    const progressFile = path.join(workDir, 'progress.txt')
    const finalOutput = path.join(projectDir, 'output.mp4')
    const tempOutput = path.join(projectDir, 'output.tmp.mp4')

    await this.prisma.project.update({ where: { id: project.id }, data: { status: 'exporting' } })

    try {
      await fs.promises.rm(workDir, { recursive: true, force: true })
      await fs.promises.mkdir(fontsDir, { recursive: true })

      // 1) Bahan ASS memakai paket shared yang sama dengan preview.
      const measurer = await this.measurerFor(style.fontFile)
      const groups = buildGroups(transcript.words, style, video, measurer)
      const ass = generateAss(groups, style, video)
      await fs.promises.writeFile(assPath, ass, 'utf8')
      await this.copyFont(style.fontFile, fontsDir)

      // 2) Rakit perintah FFmpeg (cwd = workDir agar path filter relatif).
      const hasAudio = project.hasAudio && Boolean(project.audioCodec)
      const audioArgs: string[] =
        !hasAudio
          ? []
          : COPYABLE_AUDIO.has(project.audioCodec ?? '')
            ? ['-c:a', 'copy']
            : ['-c:a', 'aac', '-b:a', '192k']

      const baseArgs = [
        '-y',
        '-i',
        videoPath,
        '-map',
        '0:v:0',
        ...(hasAudio ? ['-map', '0:a:0'] : []),
        '-vf',
        'ass=captions.ass:fontsdir=fonts',
        '-pix_fmt',
        'yuv420p',
        ...audioArgs,
        '-movflags',
        '+faststart',
        '-progress',
        progressFile,
        '-nostats',
      ]

      const useNvenc = await this.hasNvenc()
      const duration = Math.max(project.durationSec, 0.001)

      const runFfmpeg = async (encoder: 'nvenc' | 'cpu') => {
        const encoderArgs =
          encoder === 'nvenc'
            ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '21', '-b:v', '0']
            : ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium']

        await fs.promises.rm(progressFile, { force: true })
        const timer = setInterval(() => {
          void this.readProgress(progressFile, duration, context)
        }, 350)

        try {
          return await runCommand(
            this.env.ffmpegPath,
            [...baseArgs, ...encoderArgs, tempOutput],
            { cwd: workDir, signal: context.signal, logDir: this.env.tmpDir },
          )
        } finally {
          clearInterval(timer)
        }
      }

      let result = await runFfmpeg(useNvenc ? 'nvenc' : 'cpu')
      if (result.code !== 0 && useNvenc && !context.signal.aborted) {
        this.logger.warn(
          `NVENC gagal (${result.stderr.trim().split(/\r?\n/).slice(-1)}); mencoba libx264.`,
        )
        this.nvencAvailable = false
        context.setProgress(0)
        result = await runFfmpeg('cpu')
      }

      if (context.signal.aborted) throw new Error('Export dibatalkan.')
      if (result.code !== 0) {
        const detail = result.stderr.trim().split(/\r?\n/).slice(-4).join(' ')
        throw new Error(`Export gagal: ${detail || 'FFmpeg berhenti tanpa pesan'}`)
      }

      const stat = await fs.promises.stat(tempOutput).catch(() => null)
      if (!stat || stat.size === 0) throw new Error('Export gagal: berkas hasil kosong.')

      await fs.promises.rm(finalOutput, { force: true })
      await fs.promises.rename(tempOutput, finalOutput)

      await this.prisma.project.update({ where: { id: project.id }, data: { status: 'ready' } })
      context.setProgress(1)
      return { outputPath: this.storage.toDataRelative(finalOutput) }
    } catch (error) {
      await fs.promises.rm(tempOutput, { force: true }).catch(() => undefined)
      await this.prisma.project
        .update({
          where: { id: project.id },
          data: { status: parseTranscript(project.transcriptJson) ? 'ready' : 'uploaded' },
        })
        .catch(() => undefined)
      throw error
    } finally {
      await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private async readProgress(
    file: string,
    duration: number,
    context: JobRunnerContext,
  ): Promise<void> {
    let text: string
    try {
      text = await fs.promises.readFile(file, 'utf8')
    } catch {
      return
    }
    const matches = [...text.matchAll(/out_time_us=(\d+)/g)]
    const last = matches[matches.length - 1]
    if (!last) return
    const seconds = Number(last[1]) / 1_000_000
    if (!Number.isFinite(seconds)) return
    context.setProgress(Math.max(0.01, Math.min(0.99, seconds / duration)))
  }

  private async hasNvenc(): Promise<boolean> {
    if (this.nvencAvailable !== null) return this.nvencAvailable
    const result = await runCommand(this.env.ffmpegPath, ['-hide_banner', '-encoders'], {
      logDir: this.env.tmpDir,
      timeoutMs: 20_000,
    })
    this.nvencAvailable = result.code === 0 && result.stdout.includes('h264_nvenc')
    return this.nvencAvailable
  }

  private async measurerFor(fontFile: string): Promise<Measurer> {
    const cached = this.measurers.get(fontFile)
    if (cached) return cached

    const fontPath = path.join(this.env.fontsDir, fontFile)
    try {
      const data = await fs.promises.readFile(fontPath)
      const measurer = createMeasurer(data)
      this.measurers.set(fontFile, measurer)
      return measurer
    } catch {
      this.logger.warn(
        `Font ${fontFile} tidak ditemukan di ${this.env.fontsDir}; pengukuran lebar memakai perkiraan.`,
      )
      const fallback = createFallbackMeasurer()
      return fallback
    }
  }

  private async copyFont(fontFile: string, fontsDir: string): Promise<void> {
    const fontPath = path.join(this.env.fontsDir, fontFile)
    try {
      await fs.promises.copyFile(fontPath, path.join(fontsDir, path.basename(fontFile)))
    } catch {
      this.logger.warn(`Tidak dapat menyalin font ${fontFile} ke folder kerja export.`)
    }
  }
}
