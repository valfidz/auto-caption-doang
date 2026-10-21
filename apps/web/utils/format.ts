export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Rasio tampilan yang umum, atau null bila bukan rasio standar. */
export function aspectLabel(width: number, height: number): string {
  if (!width || !height) return '—'
  const ratio = width / height
  const known: Array<[number, string]> = [
    [16 / 9, '16:9'],
    [9 / 16, '9:16'],
    [1, '1:1'],
    [4 / 5, '4:5'],
    [3 / 4, '3:4'],
    [4 / 3, '4:3'],
  ]
  for (const [value, label] of known) {
    if (Math.abs(ratio - value) < 0.01) return label
  }
  return `${width}×${height}`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
