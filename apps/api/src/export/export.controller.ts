import { Controller, Get, HttpCode, NotFoundException, Param, Post, Res } from '@nestjs/common'
import type { Response } from 'express'
import fs from 'node:fs'
import type { JobDto } from '@acs/shared'
import { PrismaService } from '../prisma/prisma.module'
import { ProjectsService } from '../projects/projects.service'
import { StorageService } from '../projects/storage.service'
import { ExportService } from './export.service'

function safeFileName(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${cleaned || 'caption'}.mp4`
}

@Controller('projects')
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly projects: ProjectsService,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(':id/export')
  @HttpCode(202)
  start(@Param('id') id: string): Promise<JobDto> {
    return this.exportService.start(id)
  }

  @Get(':id/export/download')
  async download(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const project = await this.projects.getRow(id)
    const job = await this.prisma.job.findFirst({
      where: { projectId: id, type: 'export', status: 'done' },
      orderBy: { createdAt: 'desc' },
    })
    if (!job?.outputPath) {
      throw new NotFoundException('Belum ada hasil export untuk proyek ini.')
    }

    const absolutePath = this.storage.resolveDataPath(job.outputPath)
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Berkas hasil export tidak ditemukan di disk. Export ulang.')
    }

    res.setHeader('Content-Type', 'video/mp4')
    res.download(absolutePath, safeFileName(project.title))
  }
}
