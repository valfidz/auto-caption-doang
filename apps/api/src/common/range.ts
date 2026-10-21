export interface ByteRange {
  start: number
  end: number
}

/**
 * Parse header `Range: bytes=...` untuk satu rentang.
 * - `undefined` → null (kirim seluruh berkas)
 * - `'invalid'` → 416
 */
export function parseRangeHeader(
  header: string | undefined,
  size: number,
): ByteRange | null | 'invalid' {
  if (!header) return null
  if (size <= 0) return 'invalid'

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return 'invalid'

  const [, startRaw, endRaw] = match
  if (startRaw === '' && endRaw === '') return 'invalid'

  let start: number
  let end: number

  if (startRaw === '') {
    // bytes=-N : N byte terakhir
    const suffix = Number(endRaw)
    if (!Number.isInteger(suffix) || suffix <= 0) return 'invalid'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startRaw)
    if (!Number.isInteger(start) || start < 0) return 'invalid'
    if (endRaw === '') {
      end = size - 1
    } else {
      const parsedEnd = Number(endRaw)
      if (!Number.isInteger(parsedEnd)) return 'invalid'
      end = Math.min(parsedEnd, size - 1)
    }
  }

  if (start >= size || start > end) return 'invalid'
  return { start, end }
}
