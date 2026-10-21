import { describe, expect, it } from 'vitest'
import {
  deleteWordAt,
  insertAfter,
  joinWithNext,
  normalizeWords,
  splitWord,
  updateWordText,
  type Word,
} from '../src'

const w = (id: string, text: string, start: number, end: number): Word => ({ id, text, start, end })

describe('normalizeWords', () => {
  it('membuang kata kosong dan merapikan spasi', () => {
    const result = normalizeWords([w('a', '  hello ', 0, 0.3), w('b', '   ', 0.4, 0.5)])
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('hello')
  })

  it('memaksa end > start minimal 20 ms', () => {
    const result = normalizeWords([w('a', 'hi', 1, 1)])
    expect(result[0].end - result[0].start).toBeCloseTo(0.02, 3)
  })

  it('membuat waktu naik monoton', () => {
    const result = normalizeWords([w('a', 'one', 0, 1), w('b', 'two', 0.5, 0.8)])
    expect(result[1].start).toBeGreaterThanOrEqual(result[0].end)
    expect(result[1].end).toBeGreaterThan(result[1].start)
  })

  it('memberi ID baru bila kosong', () => {
    const result = normalizeWords([{ id: '', text: 'hi', start: 0, end: 0.2 }], () => 'generated')
    expect(result[0].id).toBe('generated')
  })

  it('membuang waktu yang tidak valid', () => {
    const result = normalizeWords([{ id: 'x', text: 'bad', start: NaN, end: 0.2 }])
    expect(result).toHaveLength(0)
  })
})

describe('joinWithNext', () => {
  it('menggabung teks tanpa spasi, start pertama, end terakhir', () => {
    const words = [w('a', 'an', 0, 0.2), w('b', 'd', 0.25, 0.4), w('c', 'ok', 0.5, 0.6)]
    const result = joinWithNext(words, 0)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'a', text: 'and', start: 0, end: 0.4 })
  })

  it('tidak berubah bila index terakhir', () => {
    const words = [w('a', 'one', 0, 0.2)]
    expect(joinWithNext(words, 0)).toEqual(words)
  })
})

describe('splitWord', () => {
  it('membagi durasi proporsional dengan jumlah karakter', () => {
    const words = [w('a', 'abcdefgh', 0, 2)]
    const result = splitWord(words, 0, () => 'new')
    expect(result).toHaveLength(2)
    expect(result[0].text).toBe('abcd')
    expect(result[1].text).toBe('efgh')
    expect(result[0].start).toBe(0)
    expect(result[0].end).toBeCloseTo(1, 3)
    expect(result[1].start).toBeCloseTo(1, 3)
    expect(result[1].end).toBe(2)
  })

  it('memilih titik potong pada spasi terdekat', () => {
    const words = [w('a', 'hello there', 0, 1)]
    const result = splitWord(words, 0, () => 'new')
    expect(result[0].text).toBe('hello')
    expect(result[1].text).toBe('there')
  })

  it('tidak membagi kata satu karakter', () => {
    const words = [w('a', 'a', 0, 0.2)]
    expect(splitWord(words, 0)).toEqual(words)
  })
})

describe('deleteWordAt & updateWordText', () => {
  it('menghapus kata pada index', () => {
    const words = [w('a', 'one', 0, 0.2), w('b', 'two', 0.3, 0.5)]
    expect(deleteWordAt(words, 0).map((item) => item.id)).toEqual(['b'])
  })

  it('mengabaikan index di luar rentang', () => {
    const words = [w('a', 'one', 0, 0.2)]
    expect(deleteWordAt(words, 5)).toEqual(words)
  })

  it('mengubah teks tanpa mengubah timing', () => {
    const words = [w('a', 'helo', 0.4, 0.9)]
    const result = updateWordText(words, 0, ' hello ')
    expect(result[0]).toMatchObject({ text: 'hello', start: 0.4, end: 0.9, id: 'a' })
  })
})

describe('insertAfter', () => {
  it('menyisipkan kata dengan durasi minimal 0,2 detik', () => {
    const words = [w('a', 'one', 0, 0.5), w('b', 'three', 2, 2.5)]
    const result = insertAfter(words, 0, 'two', () => 'new')
    expect(result).toHaveLength(3)
    expect(result[1]).toMatchObject({ id: 'new', text: 'two', start: 0.5 })
    expect(result[1].end - result[1].start).toBeGreaterThanOrEqual(0.2)
  })

  it('tidak melewati start kata berikutnya', () => {
    const words = [w('a', 'one', 0, 0.5), w('b', 'three', 0.55, 1)]
    const result = insertAfter(words, 0, 'two', () => 'new')
    expect(result[1].end).toBeLessThanOrEqual(0.55)
  })

  it('mengabaikan teks kosong', () => {
    const words = [w('a', 'one', 0, 0.5)]
    expect(insertAfter(words, 0, '   ')).toEqual(words)
  })
})
