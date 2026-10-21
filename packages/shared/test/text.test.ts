import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STYLE,
  displayGroupText,
  displayText,
  endsComma,
  endsSentence,
  escapeAssText,
  stripPunctuation,
  type Word,
} from '../src'

const word = (text: string, start = 0, end = 0.4): Word => ({ id: text, text, start, end })

describe('deteksi akhir kalimat & koma', () => {
  it.each(['Hello.', 'Hello!', 'Hello?', 'Hello…', 'Hello."', 'Hello.)'])(
    '%s adalah akhir kalimat',
    (text) => {
      expect(endsSentence(text)).toBe(true)
    },
  )

  it.each(['Hello', 'Hello,', 'Hello;'])('%s bukan akhir kalimat', (text) => {
    expect(endsSentence(text)).toBe(false)
  })

  it('mendeteksi koma/titik koma/titik dua', () => {
    expect(endsComma('Hello,')).toBe(true)
    expect(endsComma('Hello;')).toBe(true)
    expect(endsComma('Hello:')).toBe(true)
    expect(endsComma('Hello')).toBe(false)
  })
})

describe('hide punctuation', () => {
  it('membuang tanda baca kalimat', () => {
    expect(stripPunctuation('Hello, world!')).toBe('Hello world')
    expect(stripPunctuation('Really?')).toBe('Really')
  })

  it('membuang tanda kutip di tepi tapi mempertahankan apostrof kata', () => {
    expect(stripPunctuation('"Quoted."')).toBe('Quoted')
    expect(stripPunctuation("DON'T")).toBe("DON'T")
  })

  it('menghasilkan string kosong untuk kata tanda baca saja', () => {
    expect(stripPunctuation('...')).toBe('')
  })
})

describe('displayText', () => {
  it('menerapkan uppercase dan hide punctuation', () => {
    expect(displayText(word('Hello,'), DEFAULT_STYLE)).toBe('HELLO')
  })

  it('mempertahankan tanda baca bila hidePunctuation=false', () => {
    expect(displayText(word('Hello,'), { ...DEFAULT_STYLE, hidePunctuation: false })).toBe('HELLO,')
  })

  it('tidak menerapkan uppercase bila dimatikan', () => {
    expect(displayText(word('Hello'), { ...DEFAULT_STYLE, uppercase: false })).toBe('Hello')
  })

  it('jatuh ke teks asli bila hasil pembersihan kosong', () => {
    expect(displayText(word('...'), DEFAULT_STYLE)).toBe('...')
  })

  it('menggabungkan kata grup dengan satu spasi', () => {
    expect(displayGroupText([word('Hello,'), word('World!')], DEFAULT_STYLE)).toBe('HELLO WORLD')
  })
})

describe('escapeAssText', () => {
  it('mengganti kurung kurawal (merusak override tag)', () => {
    expect(escapeAssText('a{b}c')).toBe('a(b)c')
  })

  it('menghapus baris baru', () => {
    expect(escapeAssText('a\nb\r\nc')).toBe('a b c')
  })
})
