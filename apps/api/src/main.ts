import 'reflect-metadata'
import path from 'node:path'
import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { createFileLogger } from './common/file-logger'
import { findRepoRoot, loadDotEnv, loadEnv } from './config/env'

async function bootstrap(): Promise<void> {
  const repoRoot = findRepoRoot()
  loadDotEnv(repoRoot)
  const env = loadEnv(repoRoot)

  // Semua log Nest ikut ditulis ke DATA_DIR/logs/app.log untuk tracing error.
  const logger = createFileLogger(path.join(env.dataDir, 'logs', 'app.log'))

  // Catat penyebab proses berhenti (crash/signal/exit) agar restart watch-mode
  // tidak hilang tanpa jejak di log.
  const logProcessEvent = (label: string, detail: unknown): void => {
    const text = detail instanceof Error ? (detail.stack ?? detail.message) : String(detail)
    logger.error(`${label}: ${text}`)
  }
  process.on('uncaughtException', (error) => {
    logProcessEvent('uncaughtException', error)
    process.exit(1)
  })
  process.on('unhandledRejection', (reason) => {
    logProcessEvent('unhandledRejection', reason)
    process.exit(1)
  })
  process.on('SIGTERM', () => logProcessEvent('SIGTERM', 'proses dihentikan'))
  process.on('SIGINT', () => logProcessEvent('SIGINT', 'proses dihentikan'))
  process.on('exit', (code) => logProcessEvent('exit', `code=${code}`))

  // Body parser dimatikan lalu dipasang ulang dengan limit lebih besar:
  // transkrip bisa besar, sementara unggahan video memakai stream (bukan body parser).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger,
  })
  app.useBodyParser('json', { limit: '25mb' })
  app.useBodyParser('urlencoded', { limit: '1mb' })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.enableCors({
    origin: true,
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Disposition'],
  })
  app.enableShutdownHooks()

  // Hanya bind ke loopback: pemrosesan lokal, tidak terbuka ke jaringan.
  await app.listen(env.port, '127.0.0.1')
  Logger.log(`API http://127.0.0.1:${env.port}`, 'Bootstrap')
  Logger.log(`Log: ${path.join(env.dataDir, 'logs', 'app.log')}`, 'Bootstrap')
}

bootstrap().catch((error) => {
  Logger.error(error instanceof Error ? error.stack : String(error), 'Bootstrap')
  process.exitCode = 1
})
