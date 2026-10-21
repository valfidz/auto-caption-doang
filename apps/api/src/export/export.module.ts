import { Module } from '@nestjs/common'
import { JobsModule } from '../jobs/jobs.module'
import { ProjectsModule } from '../projects/projects.module'
import { ExportController } from './export.controller'
import { ExportService } from './export.service'

@Module({
  imports: [JobsModule, ProjectsModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
