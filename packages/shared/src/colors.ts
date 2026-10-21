/** Utilitas warna: hex CSS → warna ASS (&HAABBGGRR). */

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value.trim())
}

/** '#fff' / 'fff' / '#FFFFFF' → '#FFFFFF' */
export function normalizeHex(value: string): string {
  const match = HEX_RE.exec(value.trim())
  if (!match) throw new Error(`Warna bukan hex yang valid: ${value}`)
  let hex = match[1]
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('')
  }
  return `#${hex.toUpperCase()}`
}

/**
 * Konversi ke format ASS `&HAABBGGRR`: alpha 00 = buram, urutan BGR.
 * Contoh: #7FFFD4 → &H00D4FF7F
 */
export function hexToAssColor(value: string, alpha = 0): string {
  const hex = normalizeHex(value).slice(1)
  const r = hex.slice(0, 2)
  const g = hex.slice(2, 4)
  const b = hex.slice(4, 6)
  const clampedAlpha = Math.max(0, Math.min(255, Math.round(alpha)))
  const alphaHex = clampedAlpha.toString(16).toUpperCase().padStart(2, '0')
  return `&H${alphaHex}${b}${g}${r}`
}
