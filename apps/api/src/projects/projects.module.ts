import { Module } from '@nestjs/common'
import { PresetsModule } from '../presets/presets.module'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'
import { StorageService } from './storage.service'
import { UploadService } from './upload.service'

@Module({
  imports: [PresetsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, StorageService, UploadService],
  exports: [ProjectsService, StorageService],
})
export class ProjectsModule {}
