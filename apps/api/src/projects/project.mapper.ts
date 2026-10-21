import type { Project as ProjectRow } from '@prisma/client'
import {
  DEFAULT_STYLE,
  type ProjectDto,
  type ProjectStatus,
  type StyleConfig,
  type Transcript,
} from '@acs/shared'

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'uploaded',
  'transcribing',
  'ready',
  'exporting',
  'error',
]

function safeParse<T>(json: string | null): T | null {
  if (!json) return null
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

export function parseTranscript(json: string | null): Transcript | null {
  const parsed = safeParse<Transcript>(json)
  if (!parsed || !Array.isArray(parsed.words)) return null
  return parsed
}

export function parseStyle(json: string | null): StyleConfig | null {
  const parsed = safeParse<Partial<StyleConfig>>(json)
  if (!parsed) return null
  return { ...DEFAULT_STYLE, ...parsed }
}

export function toProjectDto(row: ProjectRow): ProjectDto {
  const status = (PROJECT_STATUSES as readonly string[]).includes(row.status)
    ? (row.status as ProjectStatus)
    : 'error'
  return {
    id: row.id,
    title: row.title,
    originalName: row.originalName,
    width: row.width,
    height: row.height,
    fps: row.fps,
    durationSec: row.durationSec,
    hasAudio: row.hasAudio,
    audioCodec: row.audioCodec,
    language: row.language,
    status,
    transcript: parseTranscript(row.transcriptJson),
    style: parseStyle(row.styleJson),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
