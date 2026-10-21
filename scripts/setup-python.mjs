// Siapkan virtualenv Python + dependensi worker transkripsi.
// Semua cache ditulis di dalam repo agar tidak bergantung pada folder home.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const venvDir = path.join(repoRoot, '.venv')
const requirements = path.join(repoRoot, 'workers', 'transcriber', 'requirements.txt')

function run(command, args, extraEnv = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    windowsHide: true,
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) {
    console.error(`perintah gagal dengan exit code ${result.status}`)
    process.exit(result.status ?? 1)
  }
}

const basePython = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3')
const venvPython =
  process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python')

if (!fs.existsSync(venvPython)) {
  run(basePython, ['-m', 'venv', venvDir])
}

run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'])
run(venvPython, ['-m', 'pip', 'install', '-r', requirements], {
  PIP_CACHE_DIR: path.join(repoRoot, '.pip-cache'),
})

console.log('\nSelesai. Verifikasi dengan: pnpm doctor')
