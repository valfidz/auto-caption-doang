import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { findRepoRoot, loadDotEnv, loadEnv } from './config/env'

async function bootstrap(): Promise<void> {
  const repoRoot = findRepoRoot()
  loadDotEnv(repoRoot)
  const env = loadEnv(repoRoot)

  const app = await NestFactory.create(AppModule)
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
