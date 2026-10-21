import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * Utilitas eksekusi proses eksternal.
 *
 * Catatan desain (lihat DECISIONS.md): stdout/stderr tidak diambil lewat pipe,
 * melainkan diredireksi ke berkas sementara. Ini membuat kode berperilaku sama
 * di Windows/Linux, di lingkungan sandbox yang melarang pipe stdio, dan tetap
 * memberi akses progres (callback per baris) untuk worker transkripsi.
 */

export interface RunResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  /** pesan kegagalan tingkat eksekusi (ENOENT, timeout, abort) */
  error?: string
  durationMs: number
}

export interface RunOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  signal?: AbortSignal
  /** direktori berkas log sementara; default <cwd>/data/tmp */
  logDir?: string
  /** callback per baris stdout (dipanggil saat proses berjalan) */
  onStdoutLine?: (line: string) => void
  onStderrLine?: (line: string) => void
  /** pertahankan berkas log setelah proses selesai (untuk debug) */
  keepLogs?: boolean
  /** interval polling berkas stdout, default 120 ms */
  pollMs?: number
}

function safeRead(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function safeUnlink(file: string): void {
  try {
    fs.unlinkSync(file)
  } catch {
    /* ignore */
  }
}

function killProcessTree(child: ChildProcess): void {
  if (child.pid == null || child.exitCode !== null) return
  if (process.platform === 'win32') {
    // taskkill berjalan tanpa pipe stdio; tetap aman di sandbox.
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
  } else {
    try {
      child.kill('SIGKILL')
    } catch {
      /* ignore */
    }
  }
}

export function runCommand(
  command: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  const startedAt = Date.now()
  const logDir = opts.logDir ?? path.join(process.cwd(), 'data', 'tmp')
  fs.mkdirSync(logDir, { recursive: true })

  const id = randomUUID()
  const outPath = path.join(logDir, `proc-${id}.out.log`)
  const errPath = path.join(logDir, `proc-${id}.err.log`)

  const outFd = fs.openSync(outPath, 'w')
  const errFd = fs.openSync(errPath, 'w')

  return new Promise<RunResult>((resolve) => {
    let settled = false
    let poller: NodeJS.Timeout | null = null
    let timer: NodeJS.Timeout | null = null
    const offsets = { out: 0, err: 0 }
    const pending = { out: '', err: '' }
    let executionError: string | undefined

    const drain = (which: 'out' | 'err'): void => {
      const file = which === 'out' ? outPath : errPath
      let stat: fs.Stats
      try {
        stat = fs.statSync(file)
      } catch {
        return
      }
      const offset = offsets[which]
      if (stat.size <= offset) return
      const length = stat.size - offset
      const buffer = Buffer.alloc(length)
      let fd: number | null = null
      try {
        fd = fs.openSync(file, 'r')
        fs.readSync(fd, buffer, 0, length, offset)
      } catch {
        return
      } finally {
        if (fd !== null) fs.closeSync(fd)
      }
      offsets[which] = stat.size
      const chunk = buffer.toString('utf8')
      const handler = which === 'out' ? opts.onStdoutLine : opts.onStderrLine
      if (!handler) return
      pending[which] += chunk
      const lines = pending[which].split(/\r?\n/)
      pending[which] = lines.pop() ?? ''
      for (const line of lines) handler(line)
    }

    const flushPending = (): void => {
      if (opts.onStdoutLine && pending.out) opts.onStdoutLine(pending.out)
      if (opts.onStderrLine && pending.err) opts.onStderrLine(pending.err)
      pending.out = ''
      pending.err = ''
    }

    const closeFds = (): void => {
      for (const fd of [outFd, errFd]) {
        try {
          fs.closeSync(fd)
        } catch {
          /* ignore */
        }
      }
    }

    const onAbort = (): void => {
      executionError = 'aborted'
      killProcessTree(child)
    }

    const finish = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return
      settled = true
      if (poller) clearInterval(poller)
      if (timer) clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)

      // beri waktu OS melepas handle berkas sebelum dibaca/dihapus
      setTimeout(() => {
        drain('out')
        drain('err')
        flushPending()
        closeFds()
        const stdout = safeRead(outPath)
        const stderr = safeRead(errPath)
        if (!opts.keepLogs) {
          safeUnlink(outPath)
          safeUnlink(errPath)
        }
        resolve({
          code,
          signal,
          stdout,
          stderr,
          error: executionError,
          durationMs: Date.now() - startedAt,
        })
      }, 20)
    }

    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', outFd, errFd],
      windowsHide: true,
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      executionError = error.code === 'ENOENT' ? `not-found: ${command}` : error.message
      finish(null, null)
    })
    child.on('close', (code, signal) => finish(code, signal))

    if (opts.signal) {
      if (opts.signal.aborted) onAbort()
      else opts.signal.addEventListener('abort', onAbort, { once: true })
    }

    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        executionError = 'timeout'
        killProcessTree(child)
      }, opts.timeoutMs)
    }

    if (opts.onStdoutLine || opts.onStderrLine) {
      poller = setInterval(() => {
        drain('out')
        drain('err')
      }, opts.pollMs ?? 120)
    }
  })
}
