import fs from 'node:fs'
import path from 'node:path'
import { ConsoleLogger, type LoggerService } from '@nestjs/common'

/**
 * Logger Nest yang juga menulis ke berkas (default: DATA_DIR/logs/app.log).
 * Tujuannya: error job/worker bisa ditelusuri setelah kejadian, tanpa harus
 * menyalin output terminal.
 */
export function createFileLogger(file: string): LoggerService {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const consoleLogger = new ConsoleLogger()

  const write = (level: string, message: unknown, trace?: unknown): void => {
    const text =
      message instanceof Error
        ? (message.stack ?? message.message)
        : typeof message === 'string'
          ? message
          : JSON.stringify(message)
    const suffix = typeof trace === 'string' && trace.length > 0 ? `\n${trace}` : ''
    try {
      fs.appendFileSync(file, `[${new Date().toISOString()}] ${level} ${text}${suffix}\n`)
    } catch {
      /* logging tidak boleh menghentikan aplikasi */
    }
  }

  return {
    log: (message: any, ...rest: any[]) => {
      consoleLogger.log(message, ...rest)
      write('INFO', message)
    },
    warn: (message: any, ...rest: any[]) => {
      consoleLogger.warn(message, ...rest)
      write('WARN', message)
    },
    error: (message: any, ...rest: any[]) => {
      consoleLogger.error(message, ...rest)
      write('ERROR', message, rest[0])
    },
    debug: (message: any, ...rest: any[]) => {
      consoleLogger.debug(message, ...rest)
      write('DEBUG', message)
    },
    verbose: (message: any, ...rest: any[]) => {
      consoleLogger.verbose(message, ...rest)
      write('VERBOSE', message)
    },
    fatal: (message: any, ...rest: any[]) => {
      consoleLogger.fatal(message, ...rest)
      write('FATAL', message)
    },
  }
}
