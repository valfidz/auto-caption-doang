import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common'
import type { JobDto } from '@acs/shared'
import { JobsService } from './jobs.service'

@Controller()
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get('jobs/:id')
  get(@Param('id') id: string): Promise<JobDto> {
    return this.jobs.get(id)
  }

  @Post('jobs/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string): Promise<JobDto> {
    return this.jobs.cancel(id)
  }

  @Get('projects/:id/jobs')
  listForProject(@Param('id') id: string): Promise<JobDto[]> {
    return this.jobs.listForProject(id)
  }
}
