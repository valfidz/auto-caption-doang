import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import {
  BUILT_IN_TEMPLATES,
  DEFAULT_STYLE,
  normalizeStyle,
  type StyleConfig,
  type StylePresetDto,
} from '@acs/shared'
import { PrismaService } from '../prisma/prisma.module'

@Injectable()
export class PresetsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  /** Seed template bawaan sebagai baris preset (id = templateId) + default awal. */
  async onModuleInit(): Promise<void> {
    for (const template of BUILT_IN_TEMPLATES) {
      await this.prisma.stylePreset.upsert({
        where: { id: template.id },
        create: {
          id: template.id,
          name: template.name,
          isBuiltIn: true,
          isDefault: template.id === 'pop-bounce',
          configJson: JSON.stringify(template.config),
        },
        update: {
          name: template.name,
          isBuiltIn: true,
          configJson: JSON.stringify(template.config),
        },
      })
    }

    const hasDefault = await this.prisma.stylePreset.count({ where: { isDefault: true } })
    if (hasDefault === 0) {
      await this.prisma.stylePreset.update({
        where: { id: 'pop-bounce' },
        data: { isDefault: true },
      })
    }
  }

  private toDto(row: {
    id: string
    name: string
    isBuiltIn: boolean
    isDefault: boolean
    configJson: string
  }): StylePresetDto {
    let config: StyleConfig = DEFAULT_STYLE
    try {
      config = normalizeStyle(JSON.parse(row.configJson) as Partial<StyleConfig>)
    } catch {
      config = DEFAULT_STYLE
    }
    return {
      id: row.id,
      name: row.name,
      isBuiltIn: row.isBuiltIn,
      isDefault: row.isDefault,
      config,
    }
  }

  async list(): Promise<StylePresetDto[]> {
    const rows = await this.prisma.stylePreset.findMany({
      orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
    })
    return rows.map((row) => this.toDto(row))
  }

  async getDefaultConfig(): Promise<StyleConfig | null> {
    const row = await this.prisma.stylePreset.findFirst({ where: { isDefault: true } })
    if (!row) return null
    return this.toDto(row).config
  }

  async create(name: string, config: Partial<StyleConfig> | undefined): Promise<StylePresetDto> {
    const trimmed = name.trim()
    if (!trimmed) throw new BadRequestException('Nama preset tidak boleh kosong.')
    const row = await this.prisma.stylePreset.create({
      data: {
        name: trimmed.slice(0, 60),
        isBuiltIn: false,
        isDefault: false,
        configJson: JSON.stringify(normalizeStyle(config)),
      },
    })
    return this.toDto(row)
  }

  async remove(id: string): Promise<void> {
    const row = await this.prisma.stylePreset.findUnique({ where: { id } })
    if (!row) throw new NotFoundException(`Preset ${id} tidak ditemukan.`)
    if (row.isBuiltIn) throw new BadRequestException('Template bawaan tidak dapat dihapus.')
    await this.prisma.stylePreset.delete({ where: { id } })
    if (row.isDefault) await this.setDefault('pop-bounce')
  }

  async setDefault(id: string): Promise<StylePresetDto> {
    const row = await this.prisma.stylePreset.findUnique({ where: { id } })
    if (!row) throw new NotFoundException(`Preset ${id} tidak ditemukan.`)

    await this.prisma.$transaction([
      this.prisma.stylePreset.updateMany({ data: { isDefault: false } }),
      this.prisma.stylePreset.update({ where: { id }, data: { isDefault: true } }),
    ])
    const updated = await this.prisma.stylePreset.findUniqueOrThrow({ where: { id } })
    return this.toDto(updated)
  }
}
