/** Format waktu ASS: H:MM:SS.cc (centisecond). */

export function toCentiseconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.round(seconds * 100)
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Detik absolut → `H:MM:SS.cc`.
 * Pembulatan dilakukan pada centisecond absolut (bukan selisih), supaya
 * error pembulatan tidak menumpuk antar event.
 */
export function formatAssTime(seconds: number): string {
  const totalCs = toCentiseconds(seconds)
  const cs = totalCs % 100
  const totalSeconds = Math.floor(totalCs / 100)
  const s = totalSeconds % 60
  const m = Math.floor(totalSeconds / 60) % 60
  const h = Math.floor(totalSeconds / 3600)
  return `${h}:${pad2(m)}:${pad2(s)}.${pad2(cs)}`
}
