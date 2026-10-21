import 'reflect-metadata'
import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { findRepoRoot, loadDotEnv, loadEnv } from './config/env'

async function bootstrap(): Promise<void> {
  const repoRoot = findRepoRoot()
  loadDotEnv(repoRoot)
  const env = loadEnv(repoRoot)

  // Body parser dimatikan lalu dipasang ulang dengan limit lebih besar:
  // transkrip bisa besar, sementara unggahan video memakai stream (bukan body parser).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false })
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
}

bootstrap().catch((error) => {
  Logger.error(error instanceof Error ? error.stack : String(error), 'Bootstrap')
  process.exitCode = 1
})
