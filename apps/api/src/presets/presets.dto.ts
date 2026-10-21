import { IsObject, IsString, MaxLength, MinLength } from 'class-validator'
import type { StyleConfig } from '@acs/shared'

export class CreatePresetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string

  @IsObject()
  config!: Partial<StyleConfig>
}
