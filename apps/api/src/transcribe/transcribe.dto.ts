import { IsIn, IsOptional } from 'class-validator'
import type { Language } from '@acs/shared'

export class TranscribeDto {
  @IsOptional()
  @IsIn(['en', 'id', 'auto'])
  language?: Language = 'en'
}
