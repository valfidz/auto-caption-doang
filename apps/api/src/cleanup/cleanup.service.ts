import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import fs from 'node:fs'
import path from 'node:path'
import { APP_ENV } from '../config/env.module'
import type { AppEnv } from '../config/env'

const SIX_HOURS = 6 * 60 * 60 * 1000

/**
 * Membersihkan berkas sementara yang lebih tua dari TEMP_TTL_DAYS:
 * - isi DATA_DIR/tmp (audio, log proses, upload yang gagal, flag pembatalan)
 * - folder kerja per proyek (work/, work-export-*) dan output.tmp.mp4
 *
 * TEMP_TTL_DAYS=0 mematikan pembersihan otomatis.
 */
@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name)
  private timer: NodeJS.Timeout | null = null

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  async onModuleInit(): Promise<void> {
    await this.cleanup()
    this.timer = setInterval(() => void this.cleanup(), SIX_HOURS)
    this.timer.unref?.()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  async cleanup(now: number = Date.now()): Promise<number> {
    const ttlDays = this.env.tempTtlDays
    if (!(ttlDays > 0)) return 0
    const cutoff = now - ttlDays * 24 * 60 * 60 * 1000
    let removed = 0

    removed += await this.cleanTmpDir(cutoff)
    removed += await this.cleanProjectWork(cutoff, now)
    if (removed > 0) {
      this.logger.log(`Membersihkan ${removed} berkas sementara lebih tua dari ${ttlDays} hari.`)
    }
    return removed
  }

  private async cleanTmpDir(cutoff: number): Promise<number> {
    let removed = 0
    let entries: string[]
    try {
      entries = await fs.promises.readdir(this.env.tmpDir)
    } catch {
      return 0
    }

    for (const entry of entries) {
      const target = path.join(this.env.tmpDir, entry)
      try {
        const stat = await fs.promises.stat(target)
        if (stat.mtimeMs >= cutoff) continue
        await fs.promises.rm(target, { recursive: true, force: true })
        removed += 1
      } catch {
        /* berkas mungkin sedang dipakai proses berjalan */
      }
    }
    return removed
  }

  private async cleanProjectWork(cutoff: number, now: number): Promise<number> {
    let removed = 0
    let projectIds: string[]
    try {
      projectIds = await fs.promises.readdir(this.env.projectsDir)
    } catch {
      return 0
    }

    for (const id of projectIds) {
      const dir = path.join(this.env.projectsDir, id)
      let entries: fs.Dirent[]
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }

      for (const entry of entries) {
        const target = path.join(dir, entry.name)
        const isWorkDir = entry.isDirectory() && /^work(-export-[0-9a-f-]+)?$/.test(entry.name)
        const isTempOutput = entry.isFile() && entry.name === 'output.tmp.mp4'
        if (!isWorkDir && !isTempOutput) continue

        try {
          const stat = await fs.promises.stat(target)
          // Folder kerja yang masih muda mungkin dipakai job berjalan.
          if (stat.mtimeMs >= cutoff || now - stat.mtimeMs < 60 * 60 * 1000) continue
          await fs.promises.rm(target, { recursive: true, force: true })
          removed += 1
        } catch {
          /* abaikan */
        }
      }
    }
    return removed
  }
}
