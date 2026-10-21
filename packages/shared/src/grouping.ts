import type { CaptionGroup, StyleConfig, Word } from './types'
import { displayGroupText, endsComma, endsSentence } from './text'
import { fontSizePx, outlinePx } from './style'
import type { Measurer, VideoSize } from './measure'

/**
 * Lebar teks yang benar-benar ditampilkan (setelah uppercase/hide punctuation)
 * pada ukuran font sebenarnya, ditambah ruang outline di kiri-kanan.
 */
export function measureCaptionWidth(
  text: string,
  style: StyleConfig,
  video: VideoSize,
  measure: Measurer,
): number {
  const advance = measure.measure(text, fontSizePx(style, video))
  return advance + outlinePx(style, video) * 2
}

/**
 * Kelompokkan kata menjadi grup caption (maks N kata per layar, satu baris).
 * Aturan pemecahan: jumlah kata, akhir kalimat, koma (bila >= 2 kata),
 * jeda panjang, dan lebar teks melebihi maxWidthPct lebar video.
 *
 * Grup TIDAK disimpan; selalu dihitung ulang dari kata + style.
 */
export function buildGroups(
  words: Word[],
  style: StyleConfig,
  video: VideoSize,
  measure: Measurer,
): CaptionGroup[] {
  const groups: CaptionGroup[] = []
  let current: Word[] = []
  const maxWidth = (style.maxWidthPct / 100) * video.width

  const flush = (): void => {
    if (current.length === 0) return
    const first = current[0]
    const last = current[current.length - 1]
    groups.push({
      words: current,
      start: first.start,
      end: last.end,
      displayText: displayGroupText(current, style),
    })
    current = []
  }

  for (const word of words) {
    if (current.length > 0) {
      const last = current[current.length - 1]
      const gap = word.start - last.end
      const candidate = displayGroupText([...current, word], style)
      const tooWide = measureCaptionWidth(candidate, style, video, measure) > maxWidth

      if (
        gap > style.maxGapSec ||
        current.length >= style.maxWordsPerGroup ||
        endsSentence(last.text) ||
        (endsComma(last.text) && current.length >= 2) ||
        tooWide
      ) {
        flush()
      }
    }
    current.push(word)
  }
  flush()

  return groups
}

/** Indeks grup yang sedang tampil pada waktu tertentu (untuk sorotan di UI). */
export function findGroupIndexAt(groups: CaptionGroup[], time: number): number {
  return groups.findIndex((group) => time >= group.start && time <= group.end)
}
