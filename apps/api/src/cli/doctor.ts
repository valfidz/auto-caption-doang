import { findRepoRoot, loadDotEnv, loadEnv } from '../config/env'
import { HealthService } from '../health/health.service'
import type { HealthCheck } from '@acs/shared'

const ICON: Record<HealthCheck['status'], string> = {
  ok: '[ OK ]',
  warn: '[WARN]',
  error: '[FAIL]',
}

async function main(): Promise<void> {
  const repoRoot = findRepoRoot()
  loadDotEnv(repoRoot)
  const env = loadEnv(repoRoot)
  const service = new HealthService(env)
  const report = await service.check()

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.ok ? 0 : 1
    return
  }

  console.log('')
  console.log('Auto Caption Studio — pemeriksaan lingkungan')
  console.log('='.repeat(64))
  const nameWidth = Math.max(...report.checks.map((c) => c.name.length), 10)
  for (const check of report.checks) {
    const version = check.version ? ` (${check.version})` : ''
    console.log(`${ICON[check.status]} ${check.name.padEnd(nameWidth)}  ${check.detail}${version}`)
  }
  console.log('-'.repeat(64))
  console.log(`DATA_DIR    : ${report.env.dataDir}`)
  console.log(`FONTS_DIR   : ${report.env.fontsDir}`)
  console.log(`FFmpeg      : ${report.env.ffmpegPath}`)
  console.log(`Python      : ${report.env.pythonPath}`)
  console.log(
    `Whisper     : ${report.env.whisperModel} (${report.env.whisperDevice}, ${report.env.whisperCompute})`,
  )
  console.log('')
  if (report.ok) {
    console.log('Semua dependensi wajib siap.')
  } else {
    console.log('Ada dependensi wajib yang bermasalah. Perbaiki item [FAIL] di atas.')
  }
  console.log('')
  process.exitCode = report.ok ? 0 : 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
