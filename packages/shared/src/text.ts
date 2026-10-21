import type { StyleConfig, Word } from './types'

/** Akhir kalimat: . ? ! … (boleh diikuti tanda kutip/tutup kurung). */
const SENTENCE_END_RE = /[.!?…]["'”’»)\]]*$/
/** Akhir klausa lunak: koma, titik koma, titik dua. */
const COMMA_END_RE = /[,;:]["'”’»)\]]*$/

export function endsSentence(text: string): boolean {
  return SENTENCE_END_RE.test(text.trim())
}

export function endsComma(text: string): boolean {
  return COMMA_END_RE.test(text.trim())
}

/**
 * Buang tanda baca untuk tampilan (grouping tetap memakai teks asli).
 * Apostrof di dalam kata dipertahankan ("DON'T"), tanda kutip di tepi dibuang.
 */
export function stripPunctuation(text: string): string {
  const withoutSentenceMarks = text.replace(/[.,!?;:…]+/g, '')
  const trimmed = withoutSentenceMarks.replace(/^["'“”‘’«»()[\]]+|["'“”‘’«»()[\]]+$/g, '')
  return trimmed.replace(/\s{2,}/g, ' ').trim()
}

/** Teks kata seperti yang tampil di layar (uppercase + hide punctuation). */
export function displayText(word: Word, style: StyleConfig): string {
  const base = style.hidePunctuation ? stripPunctuation(word.text) : word.text.trim()
  const text = base.length > 0 ? base : word.text.trim()
  return style.uppercase ? text.toUpperCase() : text
}

/** Gabungan teks tampilan sebuah grup (dipakai untuk pengukuran lebar & ASS). */
export function displayGroupText(words: Word[], style: StyleConfig): string {
  return words
    .map((word) => displayText(word, style))
    .filter((text) => text.length > 0)
    .join(' ')
}

/** Escape teks untuk field Text ASS: kurung kurawal merusak override tag. */
export function escapeAssText(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\{/g, '(').replace(/\}/g, ')')
}
