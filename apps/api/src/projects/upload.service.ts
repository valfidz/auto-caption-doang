import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import Busboy from 'busboy'
import type { IncomingMessage } from 'node:http'
import type { AppEnv } from '../config/env'
import { APP_ENV } from '../config/env.module'

export interface ReceivedUpload {
  tempDir: string
  tempPath: string
  originalName: string
  mimeType: string
  size: number
  fields: Record<string, string>
}

/**
 * Menerima multipart/form-data sebagai stream langsung ke disk.
 * Tidak ada buffering ke memori, jadi durasi/ukuran file tidak dibatasi body parser.
 */
@Injectable()
export class UploadService {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  receive(req: IncomingMessage): Promise<ReceivedUpload> {
    return new Promise<ReceivedUpload>((resolve, reject) => {
      const tempDir = path.join(this.env.tmpDir, `upload-${randomUUID()}`)
      fs.mkdirSync(tempDir, { recursive: true })
      const tempPath = path.join(tempDir, 'source.bin')

      let settled = false
      let filePromise: Promise<{ originalName: string; mimeType: string }> | null = null
      let size = 0
      const fields: Record<string, string> = {}

      const cleanupAndReject = (error: Error) => {
        if (settled) return
        settled = true
        fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
        reject(error)
      }

      let busboy: Busboy.Busboy
      try {
        busboy = Busboy({
          headers: req.headers,
          limits: { files: 1, fields: 12 },
          // Nama berkas dari browser dikirim sebagai UTF-8.
          defParamCharset: 'utf8',
        })
      } catch {
        cleanupAndReject(new BadRequestException('Request harus multipart/form-data.'))
        return
      }

      busboy.on('file', (_name, stream, info) => {
        filePromise = new Promise<{ originalName: string; mimeType: string }>((done, fail) => {
          const writeStream = fs.createWriteStream(tempPath)
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length
          })
          writeStream.on('finish', () =>
            done({ originalName: info.filename ?? 'video', mimeType: info.mimeType ?? '' }),
          )
          writeStream.on('error', fail)
          stream.on('error', fail)
          stream.on('limit', () => fail(new BadRequestException('Berkas melebihi batas unggah.')))
          stream.pipe(writeStream)
        })
      })

      busboy.on('field', (name, value) => {
        fields[name] = value
      })

      busboy.on('error', (error: Error) => cleanupAndReject(error))

      busboy.on('close', async () => {
        if (settled) return
        if (!filePromise) {
          cleanupAndReject(new BadRequestException('Tidak ada berkas video pada request.'))
          return
        }
        try {
          const file = await filePromise
          if (size === 0) throw new BadRequestException('Berkas video kosong.')
          settled = true
          resolve({ tempDir, tempPath, size, fields, ...file })
        } catch (error) {
          cleanupAndReject(error instanceof Error ? error : new Error(String(error)))
        }
      })

      req.on('aborted', () => cleanupAndReject(new BadRequestException('Unggahan dibatalkan.')))
      req.pipe(busboy)
    })
  }
}
