import type { Word } from './types'

let idCounter = 0

/** ID kata yang unik tanpa bergantung pada crypto (aman di browser & Node). */
export function createWordId(): string {
  idCounter += 1
  return `w-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`
}

function round3(value: number): number {
  return Number(value.toFixed(3))
}

/**
 * Normalisasi daftar kata: buang teks kosong, paksa end > start (min 20 ms),
 * dan urutan waktu naik monoton. ID yang hilang diberi ID baru.
 */
export function normalizeWords(words: Word[], makeId: () => string = createWordId): Word[] {
  const result: Word[] = []
  let previousEnd = 0
  for (const word of words) {
    const text = typeof word.text === 'string' ? word.text.trim() : ''
    if (!text) continue
    const rawStart = Number(word.start)
    const rawEnd = Number(word.end)
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue

    const start = Math.max(rawStart, previousEnd, 0)
    const end = Math.max(rawEnd, start + 0.02)
    result.push({
      id: word.id || makeId(),
      text,
      start: round3(start),
      end: round3(end),
    })
    previousEnd = end
  }
  return result
}

/** Gabung kata `index` dengan kata berikutnya: teks disambung, waktu = rentang keduanya. */
export function joinWithNext(words: Word[], index: number): Word[] {
  const first = words[index]
  const second = words[index + 1]
  if (!first || !second) return words
  const merged: Word = {
    id: first.id,
    text: `${first.text.trim()}${second.text.trim()}`,
    start: first.start,
    end: second.end,
  }
  return [...words.slice(0, index), merged, ...words.slice(index + 2)]
}

/**
 * Pisah satu kata menjadi dua: durasi dibagi proporsional dengan jumlah karakter.
 * Titik potong diambil pada spasi terdekat dengan tengah, atau tengah kata.
 */
export function splitWord(words: Word[], index: number, makeId: () => string = createWordId): Word[] {
  const word = words[index]
  if (!word) return words
  const text = word.text.trim()
  if (text.length < 2) return words

  const middle = Math.floor(text.length / 2)
  let left = ''
  let right = ''

  const spaceBefore = text.lastIndexOf(' ', middle)
  const spaceAfter = text.indexOf(' ', middle)
  const spaceCut =
    spaceBefore >= 0 && (spaceAfter < 0 || middle - spaceBefore <= spaceAfter - middle)
      ? spaceBefore
      : spaceAfter

  if (spaceCut > 0) {
    left = text.slice(0, spaceCut).trim()
    right = text.slice(spaceCut + 1).trim()
  } else {
    left = text.slice(0, middle).trim()
    right = text.slice(middle).trim()
  }

  if (!left || !right) return words

  const total = Math.max(word.end - word.start, 0.04)
  const ratio = left.length / (left.length + right.length)
  const splitAt = round3(word.start + total * ratio)

  const first: Word = { id: word.id, text: left, start: word.start, end: splitAt }
  const second: Word = { id: makeId(), text: right, start: splitAt, end: word.end }
  return [...words.slice(0, index), first, second, ...words.slice(index + 1)]
}

export function deleteWordAt(words: Word[], index: number): Word[] {
  if (index < 0 || index >= words.length) return words
  return [...words.slice(0, index), ...words.slice(index + 1)]
}

/**
 * Sisipkan kata setelah `index` dengan durasi minimal 0,2 detik pada celah
 * yang tersedia; tidak melewati start kata berikutnya bila memungkinkan.
 */
export function insertAfter(
  words: Word[],
  index: number,
  text: string,
  makeId: () => string = createWordId,
): Word[] {
  const trimmed = text.trim()
  if (!trimmed) return words
  const previous = words[index]
  const start = previous ? previous.end : 0
  const next = words[index + 1]
  const available = next ? next.start - start : 0.2
  let end = start + Math.max(0.2, available)
  if (next && end > next.start) end = Math.max(start + 0.05, next.start)
  const word: Word = { id: makeId(), text: trimmed, start: round3(start), end: round3(end) }
  const at = previous ? index + 1 : 0
  return [...words.slice(0, at), word, ...words.slice(at)]
}

/** Ubah teks satu kata tanpa menyentuh timing-nya. */
export function updateWordText(words: Word[], index: number, text: string): Word[] {
  const word = words[index]
  if (!word) return words
  const trimmed = text.trim()
  if (!trimmed) return words
  return [...words.slice(0, index), { ...word, text: trimmed }, ...words.slice(index + 1)]
}
