import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STYLE,
  buildGroups,
  findGroupIndexAt,
  type Measurer,
  type StyleConfig,
  type Word,
  type VideoSize,
} from '../src'
import { fakeMeasurer, realMeasurer, zeroMeasurer } from './helpers'

const video: VideoSize = { width: 1000, height: 1000 }

function style(overrides: Partial<StyleConfig> = {}): StyleConfig {
  return {
    ...DEFAULT_STYLE,
    fontSizePct: 10,
    maxWidthPct: 100,
    maxWordsPerGroup: 4,
    maxGapSec: 0.5,
    uppercase: true,
    hidePunctuation: true,
    ...overrides,
  }
}

function words(...items: Array<[string, number, number]>): Word[] {
  return items.map(([text, start, end], index) => ({ id: `w${index}`, text, start, end }))
}

describe('buildGroups', () => {
  it('membatasi jumlah kata per layar', () => {
    const groups = buildGroups(
      words(
        ['one', 0, 0.3],
        ['two', 0.4, 0.7],
        ['three', 0.8, 1.1],
        ['four', 1.2, 1.5],
        ['five', 1.6, 1.9],
      ),
      style(),
      video,
      zeroMeasurer,
    )
    expect(groups.map((group) => group.words.length)).toEqual([4, 1])
    expect(groups[0].displayText).toBe('ONE TWO THREE FOUR')
    expect(groups[1].displayText).toBe('FIVE')
  })

  it('memecah pada jeda lebih dari maxGapSec', () => {
    const groups = buildGroups(
      words(['hello', 0, 0.4], ['world', 1.2, 1.6]),
      style({ maxGapSec: 0.5 }),
      video,
      zeroMeasurer,
    )
    expect(groups).toHaveLength(2)
    expect(groups[0].end).toBe(0.4)
    expect(groups[1].start).toBe(1.2)
  })

  it('tidak memecah pada jeda yang masih di bawah ambang', () => {
    const groups = buildGroups(
      words(['hello', 0, 0.4], ['world', 0.85, 1.2]),
      style({ maxGapSec: 0.5 }),
      video,
      zeroMeasurer,
    )
    expect(groups).toHaveLength(1)
  })

  it('memecah setelah akhir kalimat', () => {
    const groups = buildGroups(
      words(['Hello.', 0, 0.4], ['World', 0.45, 0.8]),
      style(),
      video,
      zeroMeasurer,
    )
    expect(groups).toHaveLength(2)
    expect(groups[0].displayText).toBe('HELLO')
    expect(groups[1].displayText).toBe('WORLD')
  })

  it('koma memecah hanya bila sudah ada minimal 2 kata', () => {
    const oneWord = buildGroups(
      words(['Hello,', 0, 0.3], ['world', 0.4, 0.7]),
      style(),
      video,
      zeroMeasurer,
    )
    expect(oneWord).toHaveLength(1)

    const twoWords = buildGroups(
      words(['Hello,', 0, 0.3], ['world,', 0.4, 0.7], ['again', 0.8, 1.1]),
      style(),
      video,
      zeroMeasurer,
    )
    expect(twoWords).toHaveLength(2)
    expect(twoWords[0].displayText).toBe('HELLO WORLD')
    expect(twoWords[1].displayText).toBe('AGAIN')
  })

  it('memecah ketika lebar teks melebihi maxWidthPct', () => {
    const measurer: Measurer = fakeMeasurer(0.6)
    const groups = buildGroups(
      words(['aaaa', 0, 0.3], ['bbbb', 0.4, 0.7], ['cccc', 0.8, 1.1]),
      style({ maxWidthPct: 50 }), // 500 px; fontSize 100 → 9 karakter = 540 px
      video,
      measurer,
    )
    expect(groups.map((group) => group.displayText)).toEqual(['AAAA', 'BBBB', 'CCCC'])
  })

  it('kata yang sangat panjang tetap tampil sebagai grup sendiri', () => {
    const groups = buildGroups(
      words(['supercalifragilisticexpialidocious', 0, 1], ['ok', 1.1, 1.3]),
      style({ maxWidthPct: 30 }),
      video,
      fakeMeasurer(),
    )
    expect(groups[0].words).toHaveLength(1)
    expect(groups[0].displayText.startsWith('SUPERCALIFRAGILISTIC')).toBe(true)
  })

  it('mengembalikan daftar kosong untuk kata kosong', () => {
    expect(buildGroups([], style(), video, zeroMeasurer)).toEqual([])
  })

  it('menyimpan start/end grup sesuai kata pertama/terakhir', () => {
    const groups = buildGroups(
      words(['one', 1.5, 1.9], ['two', 2, 2.4]),
      style(),
      video,
      zeroMeasurer,
    )
    expect(groups[0].start).toBe(1.5)
    expect(groups[0].end).toBe(2.4)
  })
})

describe('buildGroups dengan font asli', () => {
  it.each<[string, VideoSize]>([
    ['9:16', { width: 1080, height: 1920 }],
    ['16:9', { width: 1920, height: 1080 }],
    ['1:1', { width: 1080, height: 1080 }],
  ])('menghormati batas lebar pada %s', (_label, size) => {
    const wordsList = words(
      ['this', 0, 0.3],
      ['is', 0.35, 0.5],
      ['a', 0.55, 0.65],
      ['much', 0.7, 1.0],
      ['longer', 1.05, 1.4],
      ['sentence', 1.45, 1.9],
      ['with', 1.95, 2.2],
      ['several', 2.25, 2.7],
      ['words', 2.75, 3.0],
    )
    const groups = buildGroups(wordsList, DEFAULT_STYLE, size, realMeasurer())
    expect(groups.length).toBeGreaterThan(0)
    for (const group of groups) {
      expect(group.words.length).toBeLessThanOrEqual(DEFAULT_STYLE.maxWordsPerGroup)
      expect(group.displayText.length).toBeGreaterThan(0)
      const width = realMeasurer().measure(
        group.displayText,
        Math.round((Math.min(size.width, size.height) * DEFAULT_STYLE.fontSizePct) / 100),
      )
      expect(width).toBeLessThanOrEqual((DEFAULT_STYLE.maxWidthPct / 100) * size.width + 1)
    }
  })
})

describe('findGroupIndexAt', () => {
  it('menemukan grup pada waktu tertentu', () => {
    const groups = buildGroups(
      words(['one', 0, 0.4], ['two', 1, 1.4]),
      style({ maxGapSec: 0.1 }),
      video,
      zeroMeasurer,
    )
    expect(findGroupIndexAt(groups, 0.2)).toBe(0)
    expect(findGroupIndexAt(groups, 1.2)).toBe(1)
    expect(findGroupIndexAt(groups, 0.7)).toBe(-1)
  })
})
