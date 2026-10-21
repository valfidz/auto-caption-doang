import opentype from 'opentype.js'

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
