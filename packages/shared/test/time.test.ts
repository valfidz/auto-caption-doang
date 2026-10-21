import { describe, expect, it } from 'vitest'
import { formatAssTime, toCentiseconds } from '../src'

describe('format waktu ASS', () => {
  it('memformat nol', () => {
    expect(formatAssTime(0)).toBe('0:00:00.00')
  })

  it('memakai centisecond dua digit', () => {
    expect(formatAssTime(3.2)).toBe('0:00:03.20')
    expect(formatAssTime(3.204)).toBe('0:00:03.20')
    expect(formatAssTime(3.205)).toBe('0:00:03.21')
  })

  it('membulatkan dari detik absolut (bukan selisih)', () => {
    expect(formatAssTime(59.999)).toBe('0:01:00.00')
    expect(formatAssTime(0.005)).toBe('0:00:00.01')
  })

  it('mendukung jam', () => {
    expect(formatAssTime(3661.239)).toBe('1:01:01.24')
  })

  it('menganggap waktu negatif sebagai nol', () => {
    expect(formatAssTime(-2)).toBe('0:00:00.00')
    expect(toCentiseconds(-1)).toBe(0)
  })

  it('mengonversi ke centisecond', () => {
    expect(toCentiseconds(3.204)).toBe(320)
    expect(toCentiseconds(3.206)).toBe(321)
  })
})
