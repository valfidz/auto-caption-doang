import JASSUB from 'jassub'
// Aset worker & WASM dibundel Vite agar import bare module di dalam worker
// (abslink, lfa-ponyfill) tetap terselesaikan di browser.
import webglWorkerUrl from 'jassub/dist/worker/worker.js?worker&url'
import canvas2dWorkerUrl from '../workers/jassub-canvas2d.js?worker&url'
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url'
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url'

export interface CaptionRendererOptions {
  video: HTMLVideoElement
  ass: string
  /** map family → URL font (disajikan API /fonts) */
  fonts: Record<string, string>
  defaultFont: string
}

export type CaptionRendererBackend = 'webgl' | 'canvas2d'

/**
 * Uji apakah konteks WebGL di browser ini benar-benar mendukung alpha.
 * Bila tidak, kanvas caption bisa tampil buram (hitam) dan menutupi video.
 */
function webglAlphaWorks(): boolean {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
    })
    if (!gl) return false
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const pixel = new Uint8Array(4)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return pixel[3] === 0
  } catch {
    return false
  }
}

function resolveBackend(): CaptionRendererBackend {
  const requested = new URLSearchParams(window.location.search).get('preview')
  let backend: CaptionRendererBackend
  if (requested === 'webgl') backend = 'webgl'
  else if (requested === 'auto') backend = webglAlphaWorks() ? 'webgl' : 'canvas2d'
  // Default Canvas2D: hasil libass sama, tetapi komposisinya selalu transparan.
  // Kanvas WebGL JASSUB terbukti tampil buram di sebagian GPU/driver sehingga
  // menutupi video (bug "video hitam"). WebGL bisa dicoba dengan ?preview=webgl.
  else backend = 'canvas2d'

  // Berguna untuk diagnosa: terlihat di DevTools sebagai <html data-caption-renderer="...">
  document.documentElement.dataset.captionRenderer = backend
  return backend
}

function create(backend: CaptionRendererBackend, options: CaptionRendererOptions): JASSUB {
  return new JASSUB({
    video: options.video,
    subContent: options.ass,
    // Font yang dipakai di-preload agar libass tidak jatuh ke font pengganti;
    // availableFonts memungkinkan font lain dimuat saat diminta.
    fonts: Object.values(options.fonts),
    availableFonts: options.fonts,
    defaultFont: options.defaultFont,
    debug: import.meta.dev,
    workerUrl: backend === 'canvas2d' ? canvas2dWorkerUrl : webglWorkerUrl,
    wasmUrl,
    modernWasmUrl,
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Renderer caption untuk preview: JASSUB (libass WASM) memakai string ASS yang
 * dihasilkan paket shared — sama persis dengan yang dipakai export.
 *
 * Bila renderer WebGL gagal atau tidak merespons, otomatis dicoba ulang memakai
 * Canvas2D. URL `?preview=webgl` (paksa WebGL) dan `?preview=auto` (deteksi
 * alpha WebGL) tersedia untuk eksperimen; default-nya Canvas2D.
 */
export async function createCaptionRenderer(
  options: CaptionRendererOptions,
): Promise<JASSUB> {
  const backend = resolveBackend()
  try {
    const instance = create(backend, options)
    await withTimeout(instance.ready, 12_000, 'Renderer caption tidak merespons.')
    return instance
  } catch (error) {
    if (backend === 'canvas2d') throw error
    document.documentElement.dataset.captionRenderer = 'canvas2d'
    const instance = create('canvas2d', options)
    await withTimeout(instance.ready, 12_000, 'Renderer caption Canvas2D tidak merespons.')
    return instance
  }
}
