import fs from 'node:fs'
import path from 'node:path'
import { config as loadDotenv } from 'dotenv'

/**
 * Cari root monorepo dengan menelusuri ke atas sampai menemukan pnpm-workspace.yaml.
 * Dipakai agar path tidak bergantung pada cwd (portabilitas Windows/Linux).
 */
export function findRepoRoot(startDir: string = __dirname): string {
  let dir = path.resolve(startDir)
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

/** Muat .env dari root repo dan cwd (yang sudah ada menang: process.env diprioritaskan). */
export function loadDotEnv(repoRoot: string = findRepoRoot()): void {
  for (const file of [path.join(repoRoot, '.env'), path.resolve(process.cwd(), '.env')]) {
    if (fs.existsSync(file)) loadDotenv({ path: file, override: false, quiet: true })
  }
}

export interface AppEnv {
  repoRoot: string
  dataDir: string
  projectsDir: string
  tmpDir: string
  modelsDir: string
  fontsDir: string
  databaseUrl: string
  ffmpegPath: string
  ffprobePath: string
  pythonPath: string
  whisperModel: string
  whisperDevice: 'cuda' | 'cpu'
  whisperCompute: string
  tempTtlDays: number
  port: number
  webOrigin: string
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

function resolveMaybeRelative(value: string, repoRoot: string): string {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value)
}

/** Deteksi Python: .venv milik repo lebih dulu, lalu interpreter dari PATH. */
function resolvePythonPath(repoRoot: string): string {
  const explicit = process.env.PYTHON_PATH?.trim()
  if (explicit) return resolveMaybeRelative(explicit, repoRoot)

  const candidates =
    process.platform === 'win32'
      ? [path.join(repoRoot, '.venv', 'Scripts', 'python.exe')]
      : [path.join(repoRoot, '.venv', 'bin', 'python3'), path.join(repoRoot, '.venv', 'bin', 'python')]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return process.platform === 'win32' ? 'python' : 'python3'
}

export function loadEnv(repoRoot: string = findRepoRoot()): AppEnv {
  const dataDir = resolveMaybeRelative(process.env.DATA_DIR?.trim() || path.join(repoRoot, 'data'), repoRoot)
  const projectsDir = path.join(dataDir, 'projects')
  const tmpDir = path.join(dataDir, 'tmp')
  const modelsDir = resolveMaybeRelative(
    process.env.HF_HOME?.trim() || path.join(dataDir, 'models'),
    repoRoot,
  )
  const fontsDir = resolveMaybeRelative(
    process.env.FONTS_DIR?.trim() || path.join(repoRoot, 'assets', 'fonts'),
    repoRoot,
  )

  for (const dir of [dataDir, projectsDir, tmpDir, modelsDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const databaseUrl =
    process.env.DATABASE_URL?.trim() || `file:${toPosix(path.join(dataDir, 'app.db'))}`

  const device = (process.env.WHISPER_DEVICE?.trim() || 'cuda').toLowerCase()
  const tempTtlRaw = Number(process.env.TEMP_TTL_DAYS ?? 7)

  const env: AppEnv = {
    repoRoot,
    dataDir,
    projectsDir,
    tmpDir,
    modelsDir,
    fontsDir,
    databaseUrl,
    ffmpegPath: process.env.FFMPEG_PATH?.trim() || 'ffmpeg',
    ffprobePath: process.env.FFPROBE_PATH?.trim() || 'ffprobe',
    pythonPath: resolvePythonPath(repoRoot),
    whisperModel: process.env.WHISPER_MODEL?.trim() || 'large-v3',
    whisperDevice: device === 'cpu' ? 'cpu' : 'cuda',
    whisperCompute: process.env.WHISPER_COMPUTE?.trim() || 'float16',
    tempTtlDays: Number.isFinite(tempTtlRaw) && tempTtlRaw >= 0 ? tempTtlRaw : 7,
    port: Number(process.env.PORT ?? 3001),
    webOrigin: process.env.WEB_ORIGIN?.trim() || 'http://localhost:3000',
  }

  // Diperlukan Prisma & huggingface_hub yang membaca env global.
  process.env.DATABASE_URL ||= env.databaseUrl
  process.env.HF_HOME ||= env.modelsDir

  return env
}
