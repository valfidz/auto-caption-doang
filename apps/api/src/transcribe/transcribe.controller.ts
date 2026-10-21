import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common'
import type { JobDto } from '@acs/shared'
import { TranscribeDto } from './transcribe.dto'
import { TranscribeService } from './transcribe.service'

@Controller('projects')
export class TranscribeController {
  constructor(private readonly transcribe: TranscribeService) {}

  @Post(':id/transcribe')
  @HttpCode(202)
  start(@Param('id') id: string, @Body() dto: TranscribeDto): Promise<JobDto> {
    return this.transcribe.start(id, dto.language ?? 'en')
  }
}
