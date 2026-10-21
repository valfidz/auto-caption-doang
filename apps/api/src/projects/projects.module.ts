import { Module } from '@nestjs/common'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'
import { StorageService } from './storage.service'
import { UploadService } from './upload.service'

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, StorageService, UploadService],
  exports: [ProjectsService, StorageService],
})
export class ProjectsModule {}
