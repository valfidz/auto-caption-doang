import JASSUB from 'jassub'
// Aset worker & WASM dibundel Vite agar import bare module di dalam worker
// (abslink, lfa-ponyfill) tetap terselesaikan di browser.
import workerUrl from 'jassub/dist/worker/worker.js?worker&url'
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url'
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url'

export interface CaptionRendererOptions {
  video: HTMLVideoElement
  ass: string
  /** map family → URL font (disajikan API /fonts) */
  fonts: Record<string, string>
  defaultFont: string
}

/**
 * Renderer caption untuk preview: JASSUB (libass WASM) memakai string ASS yang
 * dihasilkan paket shared — sama persis dengan yang dipakai export.
 */
export async function createCaptionRenderer(
  options: CaptionRendererOptions,
): Promise<JASSUB> {
  const instance = new JASSUB({
    video: options.video,
    subContent: options.ass,
    // Font yang dipakai di-preload agar libass tidak jatuh ke font pengganti;
    // availableFonts memungkinkan font lain dimuat saat diminta.
    fonts: Object.values(options.fonts),
    availableFonts: options.fonts,
    defaultFont: options.defaultFont,
    debug: import.meta.dev,
    workerUrl,
    wasmUrl,
    modernWasmUrl,
  })
  await instance.ready
  return instance
}
