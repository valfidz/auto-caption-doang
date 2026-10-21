import { Module } from '@nestjs/common'
import { EnvModule } from './config/env.module'
import { HealthModule } from './health/health.module'
import { MediaModule } from './media/media.module'
import { PrismaModule } from './prisma/prisma.module'
import { ProjectsModule } from './projects/projects.module'

@Module({
  imports: [EnvModule, PrismaModule, MediaModule, HealthModule, ProjectsModule],
})
export class AppModule {}
