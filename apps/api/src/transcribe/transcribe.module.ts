import { Module } from '@nestjs/common'
import { JobsModule } from '../jobs/jobs.module'
import { ProjectsModule } from '../projects/projects.module'
import { TranscribeController } from './transcribe.controller'
import { TranscribeService } from './transcribe.service'

@Module({
  imports: [JobsModule, ProjectsModule],
  controllers: [TranscribeController],
  providers: [TranscribeService],
})
export class TranscribeModule {}
