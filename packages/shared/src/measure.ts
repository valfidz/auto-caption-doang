import * as opentypeNamespace from 'opentype.js'

/**
 * opentype.js punya dua build: UMD (CommonJS, dipakai Node) dan ESM (dipakai
 * browser) yang tidak mengekspor `default`. Normalisasi ini membuat impor
 * bekerja di kedua environment.
 */
const opentype = ((opentypeNamespace as unknown as { default?: typeof opentypeNamespace }).default ??
  opentypeNamespace) as typeof opentypeNamespace


/** Pengukur lebar teks yang dipakai grouping (harus sama di browser & Node). */
export interface Measurer {
  /** Lebar advance teks (piksel) pada ukuran font tertentu. */
  measure(text: string, fontSizePx: number): number
}

export interface VideoSize {
  width: number
  height: number
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof Uint8Array) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  }
  return data
}

/**
 * Buat pengukur dari berkas font (TTC/TTF/OTF). Memakai advance width +
 * kerning, sama seperti yang dilakukan libass saat menyusun baris.
 */
export function createMeasurer(fontData: ArrayBuffer | Uint8Array): Measurer {
  const font = opentype.parse(toArrayBuffer(fontData))
  return {
    measure(text: string, fontSizePx: number): number {
      if (!text) return 0
      return font.getAdvanceWidth(text, fontSizePx, { kerning: true })
    },
  }
}

/**
 * Pengukur cadangan bila berkas font tidak tersedia (mis. di unit test atau
 * sebelum font termuat). Perkiraan konservatif: 62% em per karakter.
 */
export function createFallbackMeasurer(charWidthRatio = 0.62): Measurer {
  return {
    measure(text: string, fontSizePx: number): number {
      return text.length * fontSizePx * charWidthRatio
    },
  }
}

export interface FontNames {
  /** Nama family seperti yang dibaca libass (mis. "Montserrat ExtraBold"). */
  family: string
  /** Nama subfamily (mis. "Regular", "Bold"). */
  subfamily: string
  fullName: string
}

/** Baca nama font dari tabel `name` (dipakai GET /fonts dan verifikasi style). */
export function readFontNames(fontData: ArrayBuffer | Uint8Array): FontNames {
  const font = opentype.parse(toArrayBuffer(fontData))
  const read = (name: string, fallback: string): string => {
    try {
      const value = font.getEnglishName(name as never)
      return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
    } catch {
      return fallback
    }
  }

  // Name ID 1 (fontFamily) yang dipakai libass; bukan typographic family (ID 16).
  const family = read('fontFamily', 'Unknown')
  const subfamily = read('fontSubfamily', 'Regular')
  return {
    family,
    subfamily,
    fullName: read('fullName', `${family} ${subfamily}`),
  }
}
