import { describe, expect, it } from 'vitest'
import { hexToAssColor, isHexColor, normalizeHex } from '../src'

describe('warna ASS', () => {
  it('mengubah aquamarine ke BGR ASS', () => {
    expect(hexToAssColor('#7FFFD4')).toBe('&H00D4FF7F')
  })

  it('mengubah putih dan hitam', () => {
    expect(hexToAssColor('#FFFFFF')).toBe('&H00FFFFFF')
    expect(hexToAssColor('#000000')).toBe('&H00000000')
  })

  it('mendukung alpha', () => {
    expect(hexToAssColor('#112233', 255)).toBe('&HFF332211')
    expect(hexToAssColor('#112233', 0)).toBe('&H00332211')
  })

  it('menerima hex 3 digit dan tanpa tanda pagar', () => {
    expect(normalizeHex('#fff')).toBe('#FFFFFF')
    expect(normalizeHex('7fffd4')).toBe('#7FFFD4')
  })

  it('menolak warna tidak valid', () => {
    expect(isHexColor('red')).toBe(false)
    expect(isHexColor('#12345')).toBe(false)
    expect(() => hexToAssColor('nope')).toThrow()
  })
})
