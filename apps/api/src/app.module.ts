import { Module } from '@nestjs/common'
import { EnvModule } from './config/env.module'
import { ExportModule } from './export/export.module'
import { FontsModule } from './fonts/fonts.module'
import { HealthModule } from './health/health.module'
import { JobsModule } from './jobs/jobs.module'
import { MediaModule } from './media/media.module'
import { PresetsModule } from './presets/presets.module'
import { PrismaModule } from './prisma/prisma.module'
import { ProjectsModule } from './projects/projects.module'
import { TranscribeModule } from './transcribe/transcribe.module'

@Module({
  imports: [
    EnvModule,
    PrismaModule,
    MediaModule,
    JobsModule,
    PresetsModule,
    ProjectsModule,
    TranscribeModule,
    ExportModule,
    FontsModule,
    HealthModule,
  ],
})
export class AppModule {}
