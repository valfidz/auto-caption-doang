import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common'
import type { StylePresetDto } from '@acs/shared'
import { CreatePresetDto } from './presets.dto'
import { PresetsService } from './presets.service'

@Controller('presets')
export class PresetsController {
  constructor(private readonly presets: PresetsService) {}

  @Get()
  list(): Promise<StylePresetDto[]> {
    return this.presets.list()
  }

  @Post()
  create(@Body() dto: CreatePresetDto): Promise<StylePresetDto> {
    return this.presets.create(dto.name, dto.config)
  }

  @Put(':id/default')
  setDefault(@Param('id') id: string): Promise<StylePresetDto> {
    return this.presets.setDefault(id)
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.presets.remove(id)
  }
}
