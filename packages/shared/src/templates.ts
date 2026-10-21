import type { StyleConfig, TemplateId } from './types'

/**
 * Style default "Pop Bounce" (PRD bagian 7, guidance bagian 14).
 * Semua template hanyalah preset StyleConfig.
 */
export const DEFAULT_STYLE: StyleConfig = {
  templateId: 'pop-bounce',
  fontFamily: 'Montserrat ExtraBold',
  fontFile: 'Montserrat-ExtraBold.ttf',
  fontSizePct: 6.5,
  uppercase: true,
  hidePunctuation: true,
  textColor: '#FFFFFF',
  activeColor: '#7FFFD4',
  outlineColor: '#000000',
  outlinePct: 12,
  shadowPct: 4,
  maxWordsPerGroup: 4,
  maxGapSec: 0.5,
  maxWidthPct: 80,
  popScalePct: 115,
  popStartScalePct: 85,
  popDurationMs: 180,
  posXPct: 50,
  posYPct: 72,
}

export interface StyleTemplate {
  id: TemplateId
  name: string
  description: string
  config: StyleConfig
}

function template(
  id: TemplateId,
  name: string,
  description: string,
  overrides: Partial<StyleConfig>,
): StyleTemplate {
  return {
    id,
    name,
    description,
    config: { ...DEFAULT_STYLE, ...overrides, templateId: id },
  }
}

/** Template bawaan MVP (box-highlight sengaja tidak ada: pasca-MVP). */
export const BUILT_IN_TEMPLATES: readonly StyleTemplate[] = [
  template('pop-bounce', 'Pop Bounce', 'Gaya default: kata aktif aquamarine + pop skala.', {}),
  template('karaoke-highlight', 'Karaoke Highlight', 'Warna berpindah tanpa animasi skala.', {
    popScalePct: 100,
    popStartScalePct: 100,
  }),
  template('one-word', 'One Word', 'Satu kata besar, berganti per kata.', {
    maxWordsPerGroup: 1,
    fontSizePct: 10,
    posYPct: 60,
  }),
  template('clean-subtitle', 'Clean Subtitle', 'Kalimat utuh tanpa animasi, outline halus.', {
    activeColor: '#FFFFFF',
    popScalePct: 100,
    popStartScalePct: 100,
    maxWordsPerGroup: 8,
    maxWidthPct: 85,
    uppercase: false,
    outlinePct: 8,
  }),
]

export function getTemplate(id: string): StyleConfig | null {
  const found = BUILT_IN_TEMPLATES.find((t) => t.id === id)
  return found ? { ...found.config } : null
}

export function templateName(id: string): string {
  const found = BUILT_IN_TEMPLATES.find((t) => t.id === id)
  return found ? found.name : id
}
