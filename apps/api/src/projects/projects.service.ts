import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Project as ProjectRow } from '@prisma/client'
import { DEFAULT_STYLE, LANGUAGES, type Language, type ProjectDto } from '@acs/shared'
import { APP_ENV } from '../config/env.module'
import type { AppEnv } from '../config/env'
import { FfprobeService } from '../media/ffprobe.service'
import { PrismaService } from '../prisma/prisma.module'
import { toProjectDto } from './project.mapper'
import { StorageService } from './storage.service'
import type { ReceivedUpload } from './upload.service'

export const ALLOWED_VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.mkv',
  '.webm',
  '.m4v',
  '.avi',
])

function titleFromFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename)).trim()
  return (base || 'Untitled video').slice(0, 200)
}

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ffprobe: FfprobeService,
  ) {}

  async list(): Promise<ProjectDto[]> {
    const rows = await this.prisma.project.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map(toProjectDto)
  }

  async getRow(id: string): Promise<ProjectRow> {
    const row = await this.prisma.project.findUnique({ where: { id } })
    if (!row) throw new NotFoundException(`Proyek ${id} tidak ditemukan.`)
    return row
  }

  async get(id: string): Promise<ProjectDto> {
    return toProjectDto(await this.getRow(id))
  }

  /** Buat proyek dari hasil unggahan streaming: probe → pindahkan berkas → simpan baris. */
  async createFromUpload(upload: ReceivedUpload): Promise<ProjectDto> {
    try {
      const ext = path.extname(upload.originalName).toLowerCase()
      if (!ALLOWED_VIDEO_EXTENSIONS.has(ext)) {
        throw new BadRequestException(
          `Format ${ext || '(tanpa ekstensi)'} tidak didukung. Gunakan MP4, MOV, MKV, WebM, M4V, atau AVI.`,
        )
      }

      const languageField = upload.fields.language ?? 'en'
      const language: Language = (LANGUAGES as readonly string[]).includes(languageField)
        ? (languageField as Language)
        : 'en'

      // Probe sebelum menyimpan: file rusak/tanpa video tidak boleh menjadi proyek.
      const meta = await this.ffprobe.probe(upload.tempPath)

      const id = randomUUID()
      const dir = await this.storage.ensureProjectDir(id)
      const destination = path.join(dir, `source${ext}`)
      await this.storage.moveFile(upload.tempPath, destination)

      const title = (upload.fields.title ?? '').trim() || titleFromFilename(upload.originalName)

      const row = await this.prisma.project.create({
        data: {
          id,
          title: title.slice(0, 200),
          originalName: upload.originalName,
          videoPath: this.storage.toDataRelative(destination),
          width: meta.width,
          height: meta.height,
          fps: meta.fps,
          durationSec: meta.durationSec,
          hasAudio: meta.hasAudio,
          audioCodec: meta.audioCodec,
          language,
          status: 'uploaded',
          styleJson: JSON.stringify(DEFAULT_STYLE),
        },
      })
      return toProjectDto(row)
    } finally {
      await this.storage.removeDirectory(upload.tempDir)
    }
  }

  async remove(id: string): Promise<void> {
    await this.getRow(id)
    await this.prisma.project.delete({ where: { id } })
    await this.storage.removeProjectDir(id)
  }

  /** Path absolut berkas video proyek. */
  async videoPath(id: string): Promise<{ row: ProjectRow; absolutePath: string }> {
    const row = await this.getRow(id)
    const absolutePath = this.storage.resolveDataPath(row.videoPath)
    if (!(await this.storage.fileExists(absolutePath))) {
      throw new NotFoundException('Berkas video proyek tidak ditemukan di disk.')
    }
    return { row, absolutePath }
  }

  dataDir(): string {
    return this.env.dataDir
  }
}
