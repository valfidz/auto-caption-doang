// Jalankan `prisma db push` dengan DATABASE_URL yang sama seperti API runtime.
// Prisma dijalankan via node + berkas JS-nya agar portabel (tanpa .cmd/shell).
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

function findRepoRoot(start) {
  let dir = path.resolve(start)
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

const repoRoot = findRepoRoot(here)
const dataDir = path.resolve(repoRoot, process.env.DATA_DIR?.trim() || 'data')
fs.mkdirSync(dataDir, { recursive: true })

const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  `file:${path.join(dataDir, 'app.db').replace(/\\/g, '/')}`

const require = createRequire(path.join(repoRoot, 'apps', 'api', 'package.json'))
const prismaCli = require.resolve('prisma')

const result = spawnSync(process.execPath, [prismaCli, 'db', 'push'], {
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
