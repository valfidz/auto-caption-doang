import type { CaptionGroup, StyleConfig } from './types'
import { hexToAssColor } from './colors'
import { displayText, escapeAssText } from './text'
import { fontSizePx, outlinePx, shadowPx } from './style'
import { formatAssTime, toCentiseconds } from './time'
import type { VideoSize } from './measure'

/** Durasi minimal satu event (centisecond). */
const MIN_EVENT_CS = 4

/** Ekor tampilan setelah kata terakhir selesai diucapkan (detik). */
const LAST_WORD_TAIL_SEC = 0.15

function styleLine(style: StyleConfig, video: VideoSize): string {
  const size = fontSizePx(style, video)
  const outline = outlinePx(style, video).toFixed(1)
  const shadow = shadowPx(style, video).toFixed(1)
  return [
    'Style: Default',
    style.fontFamily,
    String(size),
    hexToAssColor(style.textColor),
    '&H00FFFFFF',
    hexToAssColor(style.outlineColor),
    '&H00000000',
    '0',
    '0',
    '0',
    '0',
    '100',
    '100',
    '0',
    '0',
    '1',
    outline,
    shadow,
    '5',
    '0',
    '0',
    '0',
    '1',
  ].join(',')
}

/**
 * Buat override tag untuk kata aktif (Mode A):
 * warna highlight + pop scale (85% → 115% → 100%) bila diaktifkan.
 */
function activeTags(style: StyleConfig, durationMs: number): string {
  const colour = `\\c${hexToAssColor(style.activeColor)}&`
  const popEnabled = style.popScalePct !== 100
  if (!popEnabled) return colour

  const total = Math.min(style.popDurationMs, durationMs)
  if (total < 20) return colour

  const half = Math.max(1, Math.round(total / 2))
  const full = Math.max(half + 1, Math.round(total))
  const start = Math.round(style.popStartScalePct)
  const peak = Math.round(style.popScalePct)
  return (
    colour +
    `\\fscx${start}\\fscy${start}` +
    `\\t(0,${half},\\fscx${peak}\\fscy${peak})` +
    `\\t(${half},${full},\\fscx100\\fscy100)`
  )
}

/**
 * Generator ASS (satu-satunya sumber kebenaran untuk preview & export).
 * Setiap kata dalam grup menghasilkan satu Dialogue yang menampilkan seluruh
 * kata grup dengan kata tersebut sebagai kata aktif.
 */
export function generateAss(
  groups: CaptionGroup[],
  style: StyleConfig,
  video: VideoSize,
): string {
  const x = Math.round((video.width * style.posXPct) / 100)
  const y = Math.round((video.height * style.posYPct) / 100)
  const textColour = hexToAssColor(style.textColor)
  const restore = `{\\c${textColour}&\\fscx100\\fscy100}`

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${video.width}`,
    `PlayResY: ${video.height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    styleLine(style, video),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]

  const dialogue: string[] = []

  groups.forEach((group, groupIndex) => {
    const nextGroup = groups[groupIndex + 1]
    const nextGroupStart = nextGroup ? toCentiseconds(nextGroup.start) : null

    group.words.forEach((word, wordIndex) => {
      const isLastWord = wordIndex === group.words.length - 1
      const startCs = toCentiseconds(word.start)

      let endCs: number
      if (!isLastWord) {
        endCs = toCentiseconds(group.words[wordIndex + 1].start)
      } else {
        const naturalEnd = toCentiseconds(word.end + LAST_WORD_TAIL_SEC)
        endCs = nextGroupStart !== null ? Math.min(naturalEnd, nextGroupStart) : naturalEnd
      }
      if (endCs < startCs + MIN_EVENT_CS) endCs = startCs + MIN_EVENT_CS

      const durationMs = (endCs - startCs) * 10
      const active = `{${activeTags(style, durationMs)}}`

      // Kata aktif diikuti tag pemulihan warna/skala secara eksplisit; tag
      // menempel pada kata aktif sehingga spasi tetap menjadi bagian kata berikut.
      const parts = group.words.map((item, itemIndex) => {
        const text = escapeAssText(displayText(item, style))
        if (itemIndex === wordIndex) return `${active}${text}${restore}`
        return text
      })

      const line = `{\\an5\\pos(${x},${y})}${parts.join(' ')}`
      dialogue.push(
        `Dialogue: 0,${formatAssTime(startCs / 100)},${formatAssTime(endCs / 100)},Default,,0,0,0,,${line}`,
      )
    })
  })

  return `${[...header, ...dialogue].join('\n')}\n`
}
