import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STYLE,
  buildGroups,
  generateAss,
  type Transcript,
  type VideoSize,
} from '../src'
import { realMeasurer } from './helpers'

const here = path.dirname(fileURLToPath(import.meta.url))
const goldenDir = path.join(here, 'golden')

const transcript: Transcript = {
  language: 'en',
  words: [
    { id: 'w0', text: 'Hello', start: 0.0, end: 0.35 },
    { id: 'w1', text: 'world,', start: 0.4, end: 0.75 },
    { id: 'w2', text: 'this', start: 0.8, end: 1.0 },
    { id: 'w3', text: 'is', start: 1.05, end: 1.15 },
    { id: 'w4', text: 'a', start: 1.2, end: 1.3 },
    { id: 'w5', text: 'test.', start: 1.35, end: 1.7 },
    { id: 'w6', text: 'Second', start: 2.6, end: 2.9 },
    { id: 'w7', text: 'sentence', start: 2.95, end: 3.5 },
    { id: 'w8', text: 'with', start: 3.55, end: 3.8 },
    { id: 'w9', text: 'several', start: 3.85, end: 4.2 },
    { id: 'w10', text: 'words', start: 4.25, end: 4.5 },
  ],
}

const cases: Array<[string, VideoSize]> = [
  ['pop-bounce-9x16', { width: 1080, height: 1920 }],
  ['pop-bounce-16x9', { width: 1920, height: 1080 }],
  ['pop-bounce-1x1', { width: 1080, height: 1080 }],
]

describe('golden file ASS', () => {
  for (const [name, video] of cases) {
    it(`menghasilkan ${name}.ass yang stabil`, () => {
      const groups = buildGroups(transcript.words, DEFAULT_STYLE, video, realMeasurer())
      const ass = generateAss(groups, DEFAULT_STYLE, video)
      const goldenPath = path.join(goldenDir, `${name}.ass`)

      if (process.env.UPDATE_GOLDEN === '1') {
        fs.mkdirSync(goldenDir, { recursive: true })
        fs.writeFileSync(goldenPath, ass, 'utf8')
      }

      expect(fs.existsSync(goldenPath)).toBe(true)
      expect(ass).toBe(fs.readFileSync(goldenPath, 'utf8'))
    })
  }
})
