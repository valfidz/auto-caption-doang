import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import type { Word } from '@acs/shared'

export class WordDto implements Word {
  @IsString()
  @MaxLength(64)
  id!: string

  @IsString()
  @MaxLength(200)
  text!: string

  @IsNumber()
  start!: number

  @IsNumber()
  end!: number
}

export class UpdateTranscriptDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20000)
  @ValidateNested({ each: true })
  @Type(() => WordDto)
  words!: WordDto[]

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string
}
