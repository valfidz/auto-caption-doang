import { DEFAULT_STYLE } from './templates'
import { isHexColor, normalizeHex } from './colors'
import type { StyleConfig } from './types'
import type { VideoSize } from './measure'

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

function pickColor(value: unknown, fallback: string): string {
  return isHexColor(value) ? normalizeHex(value) : fallback
}

function pickBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

/** Validasi + normalisasi StyleConfig dari UI/API/preset. */
export function normalizeStyle(input: Partial<StyleConfig> | null | undefined): StyleConfig {
  const raw = input ?? {}
  return {
    templateId: pickString(raw.templateId, DEFAULT_STYLE.templateId),
    fontFamily: pickString(raw.fontFamily, DEFAULT_STYLE.fontFamily),
    fontFile: pickString(raw.fontFile, DEFAULT_STYLE.fontFile),
    fontSizePct: clamp(raw.fontSizePct, 1, 30, DEFAULT_STYLE.fontSizePct),
    uppercase: pickBool(raw.uppercase, DEFAULT_STYLE.uppercase),
    hidePunctuation: pickBool(raw.hidePunctuation, DEFAULT_STYLE.hidePunctuation),
    textColor: pickColor(raw.textColor, DEFAULT_STYLE.textColor),
    activeColor: pickColor(raw.activeColor, DEFAULT_STYLE.activeColor),
    outlineColor: pickColor(raw.outlineColor, DEFAULT_STYLE.outlineColor),
    outlinePct: clamp(raw.outlinePct, 0, 40, DEFAULT_STYLE.outlinePct),
    shadowPct: clamp(raw.shadowPct, 0, 40, DEFAULT_STYLE.shadowPct),
    maxWordsPerGroup: Math.round(clamp(raw.maxWordsPerGroup, 1, 12, DEFAULT_STYLE.maxWordsPerGroup)),
    maxGapSec: clamp(raw.maxGapSec, 0, 5, DEFAULT_STYLE.maxGapSec),
    maxWidthPct: clamp(raw.maxWidthPct, 10, 100, DEFAULT_STYLE.maxWidthPct),
    popScalePct: clamp(raw.popScalePct, 100, 200, DEFAULT_STYLE.popScalePct),
    popStartScalePct: clamp(raw.popStartScalePct, 50, 150, DEFAULT_STYLE.popStartScalePct),
    popDurationMs: Math.round(clamp(raw.popDurationMs, 0, 1000, DEFAULT_STYLE.popDurationMs)),
    posXPct: clamp(raw.posXPct, 0, 100, DEFAULT_STYLE.posXPct),
    posYPct: clamp(raw.posYPct, 0, 100, DEFAULT_STYLE.posYPct),
  }
}

/** Ukuran font piksel: persentase dari sisi terpendek video. */
export function fontSizePx(style: StyleConfig, video: VideoSize): number {
  const shortest = Math.min(video.width, video.height)
  return Math.max(1, Math.round((shortest * style.fontSizePct) / 100))
}

export function outlinePx(style: StyleConfig, video: VideoSize): number {
  return (fontSizePx(style, video) * style.outlinePct) / 100
}

export function shadowPx(style: StyleConfig, video: VideoSize): number {
  return (fontSizePx(style, video) * style.shadowPct) / 100
}
