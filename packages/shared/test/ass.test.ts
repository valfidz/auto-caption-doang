import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STYLE,
  buildGroups,
  generateAss,
  type StyleConfig,
  type Word,
  type VideoSize,
} from '../src'
import { zeroMeasurer } from './helpers'

const video: VideoSize = { width: 1080, height: 1920 }

const words: Word[] = [
  { id: 'a', text: 'WHAT', start: 3.2, end: 3.5 },
  { id: 'b', text: 'ARE', start: 3.6, end: 3.8 },
  { id: 'c', text: 'YOU', start: 3.9, end: 4.1 },
  { id: 'd', text: 'DOING', start: 4.2, end: 4.5 },
]

function make(overrides: Partial<StyleConfig> = {}, list: Word[] = words): string {
  const style: StyleConfig = { ...DEFAULT_STYLE, ...overrides }
  const groups = buildGroups(list, style, video, zeroMeasurer)
  return generateAss(groups, style, video)
}

function dialogueLines(ass: string): string[] {
  return ass.split('\n').filter((line) => line.startsWith('Dialogue:'))
}

describe('generateAss — header', () => {
  const ass = make()

  it('memakai dimensi tampilan video sebagai PlayRes', () => {
    expect(ass).toContain('PlayResX: 1080')
    expect(ass).toContain('PlayResY: 1920')
    expect(ass).toContain('WrapStyle: 2')
    expect(ass).toContain('ScaledBorderAndShadow: yes')
  })

  it('menulis style dengan font, ukuran, outline, dan warna yang benar', () => {
    const styleLine = ass.split('\n').find((line) => line.startsWith('Style: Default,'))
    expect(styleLine).toBeDefined()
    const parts = (styleLine ?? '').split(',')
    expect(parts[1]).toBe('Montserrat ExtraBold')
    expect(parts[2]).toBe('70') // round(min(1080,1920) * 6.5%)
    expect(parts[3]).toBe('&H00FFFFFF')
    expect(parts[5]).toBe('&H00000000')
    expect(parts[7]).toBe('0') // Bold=0 untuk font statis ExtraBold
    expect(parts[16]).toBe('8.4') // outline 70 * 12%
    expect(parts[17]).toBe('2.8') // shadow 70 * 4%
    expect(parts[18]).toBe('5') // alignment tengah
  })
})

describe('generateAss — event per kata', () => {
  const ass = make()
  const lines = dialogueLines(ass)

  it('membuat satu Dialogue per kata', () => {
    expect(lines).toHaveLength(words.length)
  })

  it('memposisikan teks di tengah horizontal, 72% vertikal', () => {
    expect(lines[0]).toContain('{\\an5\\pos(540,1382)}')
  })

  it('menyambung waktu tanpa celah di dalam grup', () => {
    expect(lines[0]).toContain(',0:00:03.20,0:00:03.60,')
    expect(lines[1]).toContain(',0:00:03.60,0:00:03.90,')
    expect(lines[2]).toContain(',0:00:03.90,0:00:04.20,')
  })

  it('menambahkan ekor 150 ms pada kata terakhir', () => {
    expect(lines[3]).toContain(',0:00:04.20,0:00:04.65,')
  })

  it('menampilkan seluruh kata grup dengan kata aktif di-highlight', () => {
    // event untuk ARE: WHAT (biasa) + ARE (aktif) + YOU/DOING (restore)
    expect(lines[1]).toContain('WHAT')
    expect(lines[1]).toContain('YOU')
    expect(lines[1]).toContain('DOING')
    expect(lines[1]).toContain('\\c&H00D4FF7F&')
  })

  it('mengembalikan warna & skala secara eksplisit setelah kata aktif', () => {
    expect(lines[1]).toContain('ARE{\\c&H00FFFFFF&\\fscx100\\fscy100} YOU')
  })

  it('memakai animasi pop 85 → 115 → 100 dalam 180 ms', () => {
    expect(lines[0]).toContain(
      '\\c&H00D4FF7F&\\fscx85\\fscy85\\t(0,90,\\fscx115\\fscy115)\\t(90,180,\\fscx100\\fscy100)',
    )
  })

  it('tidak memakai \\r (agar posisi tidak ter-reset)', () => {
    expect(ass).not.toContain('\\r')
  })
})

describe('generateAss — opsi style', () => {
  it('tanpa animasi bila popScalePct=100', () => {
    const ass = make({ popScalePct: 100, popStartScalePct: 100 })
    const line = dialogueLines(ass)[0]
    expect(line).toContain('{\\c&H00D4FF7F&}WHAT')
    expect(line).not.toContain('\\t(')
  })

  it('menghormati uppercase & hidePunctuation', () => {
    const ass = make({}, [{ id: 'a', text: 'Hello,', start: 0, end: 0.4 }])
    expect(ass).toContain('HELLO')
    expect(ass).not.toContain('HELLO,')
  })

  it('meng-escape kurung kurawal di teks', () => {
    const ass = make({}, [{ id: 'a', text: 'a{b}', start: 0, end: 0.4 }])
    expect(ass).toContain('A(B)')
    expect(ass).not.toContain('A{B}')
  })

  it('menerapkan durasi minimal 40 ms', () => {
    const ass = make({ uppercase: false }, [
      { id: 'a', text: 'one', start: 0.5, end: 0.5 },
      { id: 'b', text: 'two', start: 0.5, end: 0.8 },
    ])
    const line = dialogueLines(ass)[0]
    expect(line).toContain('0:00:00.50,0:00:00.54')
  })

  it('tidak melewati start grup berikutnya', () => {
    const ass = make({}, [
      { id: 'a', text: 'one', start: 0, end: 0.2 },
      { id: 'b', text: 'two', start: 1.0, end: 1.2 },
    ])
    const lines = dialogueLines(ass)
    expect(lines[0]).toContain('0:00:00.00,0:00:00.35')
    expect(lines[1]).toContain('0:00:01.00,0:00:01.35')
  })
})
