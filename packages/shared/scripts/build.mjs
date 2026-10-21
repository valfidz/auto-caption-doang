// Build dual-format tanpa bundler (tsc saja) agar build tidak memerlukan esbuild.
// dist/esm + dist/cjs masing-masing diberi package.json kecil untuk menentukan modul.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(here, '..')
const require = createRequire(import.meta.url)
// Jalankan tsc lewat node + berkas JS-nya: .cmd tidak bisa di-spawn langsung di Windows.
const tscJs = require.resolve('typescript/bin/tsc')

const watch = process.argv.includes('--watch')

function build(project, moduleType) {
  const args = [tscJs, '-p', project]
  if (watch) args.push('--watch', '--preserveWatchOutput')
  const result = spawnSync(process.execPath, args, {
    cwd: pkgRoot,
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.error) {
    console.error(`Gagal menjalankan tsc: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)

  if (!watch) {
    const dir = path.join(pkgRoot, 'dist', moduleType)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      `${JSON.stringify({ type: moduleType === 'esm' ? 'module' : 'commonjs' }, null, 2)}\n`,
    )
  }
}

build('tsconfig.build.esm.json', 'esm')
build('tsconfig.build.cjs.json', 'cjs')
