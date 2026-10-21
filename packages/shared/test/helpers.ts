import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMeasurer, type Measurer } from '../src'

const here = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(here, '..', '..', '..')
export const fontPath = path.join(repoRoot, 'assets', 'fonts', 'Montserrat-ExtraBold.ttf')

let cached: Measurer | null = null

/** Pengukur memakai font Montserrat yang sama dengan yang dipakai libass. */
export function realMeasurer(): Measurer {
  if (!cached) cached = createMeasurer(fs.readFileSync(fontPath))
  return cached
}

/** Pengukur palsu: lebar = jumlah karakter × fontSize × rasio. */
export function fakeMeasurer(ratio = 0.6): Measurer {
  return {
    measure: (text: string, fontSizePx: number) => text.length * fontSizePx * ratio,
  }
}

/** Pengukur nol: tidak pernah memicu pemecahan karena lebar. */
export const zeroMeasurer: Measurer = { measure: () => 0 }
