import { Global, Module } from '@nestjs/common'
import { FfprobeService } from './ffprobe.service'

@Global()
@Module({
  providers: [FfprobeService],
  exports: [FfprobeService],
})
export class MediaModule {}
