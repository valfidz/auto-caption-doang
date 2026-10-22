import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common'
import fs from 'node:fs'
import path from 'node:path'
import type { Project as ProjectRow } from '@prisma/client'
import type { JobDto, Language, Transcript, Word } from '@acs/shared'
import { runCommand } from '../common/process'
import { APP_ENV } from '../config/env.module'
import type { AppEnv } from '../config/env'
import { JobsService, type JobRunnerContext } from '../jobs/jobs.service'
import { FfprobeService } from '../media/ffprobe.service'
import { PrismaService } from '../prisma/prisma.module'
import { ProjectsService } from '../projects/projects.service'
import { StorageService } from '../projects/storage.service'

interface WorkerMessage {
  type?: string
  value?: number
  message?: string
  words?: number
  language?: string
}

@Injectable()
export class TranscribeService {
  private readonly logger = new Logger(TranscribeService.name)

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly projects: ProjectsService,
    private readonly storage: StorageService,
    private readonly ffprobe: FfprobeService,
  ) {}

  async start(projectId: string, language: Language): Promise<JobDto> {
    const project = await this.projects.getRow(projectId)
    if (!project.hasAudio) {
      throw new BadRequestException(
        'Video ini tidak memiliki audio, jadi tidak ada yang bisa ditranskripsi.',
      )
    }
    const active = await this.jobs.findActive(projectId, 'transcribe')
    if (active) {
      throw new ConflictException('Transkripsi untuk proyek ini sedang berjalan.')
    }

    await this.prisma.project.update({ where: { id: projectId }, data: { language } })

    return this.jobs.enqueue({
      projectId,
      type: 'transcribe',
      run: (context) => this.run(project, language, context),
    })
  }

  private async run(project: ProjectRow, language: Language, context: JobRunnerContext): Promise<void> {
    const videoPath = this.storage.resolveDataPath(project.videoPath)
    const workDir = path.join(this.storage.projectDir(project.id), 'work')
    const audioPath = path.join(workDir, 'audio.wav')
    const transcriptPath = path.join(workDir, 'transcript.json')
    // Flag pembatalan disimpan di luar workDir: worker bisa memeriksanya walau
    // proses launcher sudah dihentikan (python venv berjalan sebagai proses cucu).
    const cancelFile = path.join(this.env.tmpDir, `cancel-${context.jobId}.flag`)
    const signalCancel = (): void => {
      try {
        fs.writeFileSync(cancelFile, '1')
      } catch {
        /* ignore */
      }
    }

    try {
      await fs.promises.rm(workDir, { recursive: true, force: true })
      await fs.promises.mkdir(workDir, { recursive: true })
      if (context.signal.aborted) signalCancel()
      context.signal.addEventListener('abort', signalCancel, { once: true })
      await this.prisma.project.update({
        where: { id: project.id },
        data: { status: 'transcribing', language },
      })

      context.setProgress(0.02)
      await this.ffprobe.extractAudio(videoPath, audioPath, context.signal)
      context.setProgress(0.05)

      const workerPath = path.join(this.env.repoRoot, 'workers', 'transcriber', 'transcribe.py')
      let workerError: string | null = null
      let workerDone: WorkerMessage | null = null

      const result = await runCommand(
        this.env.pythonPath,
        [
          workerPath,
          '--audio',
          audioPath,
          '--language',
          language,
          '--out',
          transcriptPath,
          '--model',
          this.env.whisperModel,
          '--device',
          this.env.whisperDevice,
          '--compute',
          this.env.whisperCompute,
          '--cancel-file',
          cancelFile,
        ],
        {
          logDir: this.env.tmpDir,
          signal: context.signal,
          env: {
            HF_HOME: this.env.modelsDir,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1',
          },
          onStdoutLine: (line) => {
            const parsed = this.parseWorkerLine(line)
            if (!parsed) return
            if (parsed.type === 'progress') {
              const value = Number(parsed.value)
              if (Number.isFinite(value)) context.setProgress(0.05 + value * 0.93)
            } else if (parsed.type === 'warning') {
              this.logger.warn(parsed.message ?? 'worker warning')
            } else if (parsed.type === 'error') {
              workerError = parsed.message ?? 'Transkripsi gagal.'
            } else if (parsed.type === 'done') {
              workerDone = parsed
            }
          },
        },
      )

      if (context.signal.aborted) throw new Error('Transkripsi dibatalkan.')

      // Pesan error worker bisa muncul di baris stdout yang terlewat oleh polling.
      if (!workerError) {
        for (const line of result.stdout.split(/\r?\n/)) {
          const parsed = this.parseWorkerLine(line)
          if (parsed?.type === 'error') workerError = parsed.message ?? 'Transkripsi gagal.'
          if (parsed?.type === 'done') workerDone = parsed
        }
      }

      if (result.code !== 0) {
        const detail =
          workerError ??
          result.stderr.trim().split(/\r?\n/).slice(-3).join(' ') ??
          'worker berhenti tanpa pesan'
        // Simpan traceback worker (bila ada) ke log aplikasi untuk tracing.
        const stderrTail = result.stderr.trim().slice(-4000)
        this.logger.error(
          `Worker transkripsi gagal (job ${context.jobId})${stderrTail ? `:\n${stderrTail}` : ''}`,
        )
        throw new Error(
          /^Transkripsi gagal/i.test(detail) ? detail : `Transkripsi gagal: ${detail}`,
        )
      }

      const transcript = await this.readTranscript(transcriptPath, language)
      await this.prisma.project.update({
        where: { id: project.id },
        data: {
          transcriptJson: JSON.stringify(transcript),
          status: 'ready',
          language: transcript.language,
        },
      })
      this.logger.log(
        `Transkripsi selesai: ${transcript.words.length} kata` +
          (workerDone?.words ? ` (worker: ${workerDone.words})` : ''),
      )
      context.setProgress(1)
    } catch (error) {
      const current = await this.prisma.project.findUnique({ where: { id: project.id } })
      const hasTranscript = Boolean(current?.transcriptJson)
      await this.prisma.project
        .update({
          where: { id: project.id },
          data: { status: context.signal.aborted ? (hasTranscript ? 'ready' : 'uploaded') : 'error' },
        })
        .catch(() => undefined)
      throw error
    } finally {
      context.signal.removeEventListener('abort', signalCancel)
      await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => undefined)
      if (!context.signal.aborted) {
        await fs.promises.rm(cancelFile, { force: true }).catch(() => undefined)
      }
    }
  }

  private parseWorkerLine(line: string): WorkerMessage | null {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) return null
    try {
      return JSON.parse(trimmed) as WorkerMessage
    } catch {
      return null
    }
  }

  private async readTranscript(file: string, requested: Language): Promise<Transcript> {
    let parsed: { language?: string; words?: unknown }
    try {
      parsed = JSON.parse(await fs.promises.readFile(file, 'utf8')) as {
        language?: string
        words?: unknown
      }
    } catch {
      throw new Error('Worker tidak menghasilkan transcript.json yang valid.')
    }

    if (!Array.isArray(parsed.words) || parsed.words.length === 0) {
      throw new Error('Transkrip kosong: tidak ada kata yang terdeteksi.')
    }

    const words: Word[] = []
    let previousStart = 0
    for (const [index, raw] of parsed.words.entries()) {
      const item = raw as Partial<Word>
      const text = typeof item.text === 'string' ? item.text.trim() : ''
      const start = Number(item.start)
      const end = Number(item.end)
      if (!text || !Number.isFinite(start) || !Number.isFinite(end)) continue
      const safeStart = Math.max(start, previousStart)
      const safeEnd = Math.max(end, safeStart + 0.02)
      words.push({
        id: typeof item.id === 'string' && item.id ? item.id : `w${index}`,
        text,
        start: Number(safeStart.toFixed(3)),
        end: Number(safeEnd.toFixed(3)),
      })
      previousStart = safeEnd
    }

    if (words.length === 0) throw new Error('Transkrip kosong setelah validasi.')

    return {
      language: parsed.language || (requested === 'auto' ? 'unknown' : requested),
      words,
    }
  }
}
