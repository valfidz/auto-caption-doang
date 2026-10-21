import {
  Body,
  Controller,
  Delete,
  Get,
  Head,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import fs from 'node:fs'
import type { ProjectDto } from '@acs/shared'
import { parseRangeHeader } from '../common/range'
import { FfprobeService } from '../media/ffprobe.service'
import { ProjectsService } from './projects.service'
import { UpdateTranscriptDto } from './transcript.dto'
import { UploadService } from './upload.service'

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly upload: UploadService,
  ) {}

  @Get()
  list(): Promise<ProjectDto[]> {
    return this.projects.list()
  }

  @Post()
  async create(@Req() req: Request): Promise<ProjectDto> {
    const upload = await this.upload.receive(req)
    return this.projects.createFromUpload(upload)
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<ProjectDto> {
    return this.projects.get(id)
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.projects.remove(id)
  }

  @Put(':id/transcript')
  updateTranscript(
    @Param('id') id: string,
    @Body() dto: UpdateTranscriptDto,
  ): Promise<ProjectDto> {
    return this.projects.updateTranscript(id, dto.words, dto.language)
  }

  @Put(':id/style')
  updateStyle(@Param('id') id: string, @Body() body: unknown): Promise<ProjectDto> {
    return this.projects.updateStyle(id, body)
  }

  /**
   * Stream video dengan dukungan HTTP Range (wajib agar seek di <video> berfungsi).
   * Respons ditulis manual karena butuh status 206 dan header Content-Range.
   */
  @Get(':id/video')
  async video(@Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const { absolutePath } = await this.projects.videoPath(id)
    const size = (await fs.promises.stat(absolutePath)).size
    const mime = FfprobeService.mimeFor(absolutePath)

    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', mime)
    res.setHeader('Cache-Control', 'no-store')

    const range = parseRangeHeader(req.headers.range, size)
    if (range === 'invalid') {
      res.status(416)
      res.setHeader('Content-Range', `bytes */${size}`)
      res.end()
      return
    }

    if (!range) {
      res.status(200)
      res.setHeader('Content-Length', size)
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      fs.createReadStream(absolutePath).pipe(res)
      return
    }

    res.status(206)
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
    res.setHeader('Content-Length', range.end - range.start + 1)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    fs.createReadStream(absolutePath, { start: range.start, end: range.end }).pipe(res)
  }

  @Head(':id/video')
  async videoHead(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.video(id, req, res)
  }
}
