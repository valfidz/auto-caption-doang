// `prisma generate` dengan DATABASE_URL yang sama seperti runtime.
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..')
const dataDir = path.resolve(repoRoot, process.env.DATA_DIR?.trim() || 'data')
const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  `file:${path.join(dataDir, 'app.db').replace(/\\/g, '/')}`

const require = createRequire(path.join(repoRoot, 'apps', 'api', 'package.json'))
const prismaCli = path.join(
  path.dirname(require.resolve('prisma/package.json')),
  'build',
  'index.js',
)

const result = spawnSync(process.execPath, [prismaCli, 'generate'], {
  cwd: path.join(repoRoot, 'apps', 'api'),
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: 'inherit',
  windowsHide: true,
})

if (result.error) {
  console.error(`Gagal menjalankan prisma: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
