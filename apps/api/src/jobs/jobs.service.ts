import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common'
import fs from 'node:fs'
import path from 'node:path'
import type { Job as JobRow } from '@prisma/client'
import type { JobDto, JobStatus, JobType } from '@acs/shared'
import { APP_ENV } from '../config/env.module'
import type { AppEnv } from '../config/env'
import { PrismaService } from '../prisma/prisma.module'

const TERMINAL: readonly JobStatus[] = ['done', 'failed', 'canceled']

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL as readonly string[]).includes(status)
}

export function toJobDto(row: JobRow): JobDto {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type as JobType,
    status: row.status as JobStatus,
    progress: row.progress,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  }
}

export interface JobRunnerContext {
  jobId: string
  projectId: string
  signal: AbortSignal
  /** 0..1 */
  setProgress(value: number): void
}

export interface JobDefinition {
  projectId: string
  type: JobType
  run: (context: JobRunnerContext) => Promise<{ outputPath?: string | null } | void>
}

interface QueueEntry extends JobDefinition {
  jobId: string
}

/**
 * Antrean job di memori: satu job berjalan pada satu waktu.
 * Status & progres dipersist ke tabel Job agar UI bisa polling.
 */
@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name)
  private readonly queue: QueueEntry[] = []
  private active: { jobId: string; controller: AbortController } | null = null

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.recoverInterrupted()
  }

  /** Saat server start: job yang masih "running" berarti terinterupsi restart. */
  async recoverInterrupted(): Promise<number> {
    const stuck = await this.prisma.job.findMany({
      where: { status: { in: ['queued', 'running'] } },
    })

    // Tulis flag pembatalan agar worker Python yatim (bila masih hidup)
    // berhenti sendiri pada pengecekan segmen berikutnya.
    for (const job of stuck) {
      if (job.type !== 'transcribe') continue
      const flag = path.join(this.env.tmpDir, `cancel-${job.id}.flag`)
      await fs.promises.writeFile(flag, '1').catch(() => undefined)
    }

    const result = await this.prisma.job.updateMany({
      where: { status: { in: ['queued', 'running'] } },
      data: {
        status: 'failed',
        error: 'Terinterupsi oleh restart server. Silakan jalankan ulang.',
        finishedAt: new Date(),
      },
    })

    // Status proyek yang menggantung dikembalikan ke kondisi yang masuk akal.
    await this.prisma.project.updateMany({
      where: { status: 'transcribing', transcriptJson: null },
      data: { status: 'uploaded' },
    })
    await this.prisma.project.updateMany({
      where: { status: 'transcribing' },
      data: { status: 'ready' },
    })
    await this.prisma.project.updateMany({
      where: { status: 'exporting' },
      data: { status: 'ready' },
    })
    return result.count
  }

  async get(id: string): Promise<JobDto> {
    const row = await this.prisma.job.findUnique({ where: { id } })
    if (!row) throw new NotFoundException(`Job ${id} tidak ditemukan.`)
    return toJobDto(row)
  }

  async findActive(projectId: string, type?: JobType): Promise<JobRow | null> {
    return this.prisma.job.findFirst({
      where: {
        projectId,
        status: { in: ['queued', 'running'] },
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  async listForProject(projectId: string, limit = 10): Promise<JobDto[]> {
    const rows = await this.prisma.job.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return rows.map(toJobDto)
  }

  async enqueue(definition: JobDefinition): Promise<JobDto> {
    const row = await this.prisma.job.create({
      data: { projectId: definition.projectId, type: definition.type, status: 'queued' },
    })
    this.queue.push({ ...definition, jobId: row.id })
    void this.pump()
    return toJobDto(row)
  }

  async cancel(jobId: string): Promise<JobDto> {
    const row = await this.prisma.job.findUnique({ where: { id: jobId } })
    if (!row) throw new NotFoundException(`Job ${jobId} tidak ditemukan.`)
    if (isTerminalStatus(row.status)) return toJobDto(row)

    const queuedIndex = this.queue.findIndex((entry) => entry.jobId === jobId)
    if (queuedIndex >= 0) {
      this.queue.splice(queuedIndex, 1)
      const updated = await this.prisma.job.update({
        where: { id: jobId },
        data: { status: 'canceled', finishedAt: new Date() },
      })
      return toJobDto(updated)
    }

    if (this.active?.jobId === jobId) {
      this.active.controller.abort()
      const updated = await this.prisma.job.update({
        where: { id: jobId },
        data: { status: 'canceled', error: 'Dibatalkan oleh pengguna.', finishedAt: new Date() },
      })
      return toJobDto(updated)
    }

    // Job sudah tidak dikenal antrean (mis. server baru start): tandai berakhir.
    const updated = await this.prisma.job.update({
      where: { id: jobId },
      data: { status: 'canceled', finishedAt: new Date() },
    })
    return toJobDto(updated)
  }

  private async updateProgress(jobId: string, value: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, value))
    await this.prisma.job
      .updateMany({ where: { id: jobId, status: 'running' }, data: { progress: clamped } })
      .catch(() => undefined)
  }

  private async pump(): Promise<void> {
    if (this.active || this.queue.length === 0) return
    const entry = this.queue.shift()
    if (!entry) return

    const controller = new AbortController()
    this.active = { jobId: entry.jobId, controller }
    this.logger.log(`Job ${entry.jobId} (${entry.type}) mulai, proyek ${entry.projectId}`)

    await this.prisma.job
      .update({
        where: { id: entry.jobId },
        data: { status: 'running', progress: 0 },
      })
      .catch(() => undefined)

    try {
      const result = await entry.run({
        jobId: entry.jobId,
        projectId: entry.projectId,
        signal: controller.signal,
        setProgress: (value) => {
          void this.updateProgress(entry.jobId, value)
        },
      })

      const current = await this.prisma.job.findUnique({ where: { id: entry.jobId } })
      if (current && current.status !== 'canceled') {
        await this.prisma.job.update({
          where: { id: entry.jobId },
          data: {
            status: 'done',
            progress: 1,
            finishedAt: new Date(),
            outputPath: result?.outputPath ?? null,
          },
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(
        `Job ${entry.jobId} (${entry.type}) gagal${controller.signal.aborted ? ' (dibatalkan)' : ''}: ${message}`,
      )
      const current = await this.prisma.job.findUnique({ where: { id: entry.jobId } })
      if (current && current.status !== 'canceled') {
        await this.prisma.job
          .update({
            where: { id: entry.jobId },
            data: {
              status: controller.signal.aborted ? 'canceled' : 'failed',
              error: controller.signal.aborted ? 'Dibatalkan oleh pengguna.' : message,
              finishedAt: new Date(),
            },
          })
          .catch(() => undefined)
      }
    } finally {
      this.active = null
      void this.pump()
    }
  }
}
