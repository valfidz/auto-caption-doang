import { Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common'
import type { Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { readFontNames, type FontInfo } from '@acs/shared'
import { APP_ENV } from '../config/env.module'
import type { AppEnv } from '../config/env'

@Controller('fonts')
export class FontsController {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  /** Daftar font di FONTS_DIR beserta family name yang dibaca dari berkasnya. */
  @Get()
  list(): FontInfo[] {
    let files: string[] = []
    try {
      files = fs
        .readdirSync(this.env.fontsDir)
        .filter((file) => /\.(ttf|otf)$/i.test(file))
        .sort()
    } catch {
      return []
    }

    return files.map((file) => {
      let family = path.basename(file, path.extname(file))
      try {
        family = readFontNames(fs.readFileSync(path.join(this.env.fontsDir, file))).family
      } catch {
        /* nama file dipakai sebagai fallback */
      }
      return { family, file }
    })
  }

  /** Layani berkas font agar web memakai font yang sama dengan libass. */
  @Get(':file')
  serve(@Param('file') file: string, @Res() res: Response): void {
    const safeName = path.basename(file)
    if (safeName !== file || !/\.(ttf|otf)$/i.test(safeName)) {
      throw new NotFoundException('Berkas font tidak ditemukan.')
    }
    const absolute = path.join(this.env.fontsDir, safeName)
    if (!fs.existsSync(absolute)) {
      throw new NotFoundException('Berkas font tidak ditemukan.')
    }
    res.setHeader('Content-Type', safeName.toLowerCase().endsWith('.otf') ? 'font/otf' : 'font/ttf')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    fs.createReadStream(absolute).pipe(res)
  }
}
