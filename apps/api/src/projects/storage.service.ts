import { Inject, Injectable } from '@nestjs/common'
import fs from 'node:fs'
import path from 'node:path'
import type { AppEnv } from '../config/env'
import { APP_ENV } from '../config/env.module'

/**
 * Semua path proyek. Kolom `videoPath`/`outputPath` di database disimpan
 * RELATIF terhadap DATA_DIR agar memindahkan folder data tidak merusak proyek.
 */
@Injectable()
export class StorageService {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  projectDir(id: string): string {
    return path.join(this.env.projectsDir, id)
  }

  /** Ubah path absolut menjadi path relatif DATA_DIR dengan pemisah '/'. */
  toDataRelative(absolutePath: string): string {
    return path.relative(this.env.dataDir, absolutePath).split(path.sep).join('/')
  }

  /** Ubah path relatif DATA_DIR menjadi absolut (menolak path yang keluar dari DATA_DIR). */
  resolveDataPath(relativePath: string): string {
    const absolute = path.resolve(this.env.dataDir, relativePath)
    const relative = path.relative(this.env.dataDir, absolute)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Path di luar DATA_DIR: ${relativePath}`)
    }
    return absolute
  }

  async ensureProjectDir(id: string): Promise<string> {
    const dir = this.projectDir(id)
    await fs.promises.mkdir(dir, { recursive: true })
    return dir
  }

  async removeProjectDir(id: string): Promise<void> {
    await fs.promises.rm(this.projectDir(id), { recursive: true, force: true })
  }

  async moveFile(from: string, to: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(to), { recursive: true })
    try {
      await fs.promises.rename(from, to)
    } catch (error) {
      // Fallback lintas volume (Windows: EXDEV) → salin lalu hapus.
      if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
        await fs.promises.copyFile(from, to)
        await fs.promises.unlink(from)
        return
      }
      throw error
    }
  }

  async removeDirectory(dir: string): Promise<void> {
    await fs.promises.rm(dir, { recursive: true, force: true })
  }

  async fileExists(file: string): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(file)
      return stat.isFile()
    } catch {
      return false
    }
  }

  async fileSize(file: string): Promise<number> {
    const stat = await fs.promises.stat(file)
    return stat.size
  }
}
