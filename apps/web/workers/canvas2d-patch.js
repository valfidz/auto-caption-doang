// Modul side-effect: matikan konteks WebGL SEBELUM modul JASSUB dievaluasi.
// Harus diimpor sebelum 'jassub/dist/worker/worker.js' agar JASSUB memilih
// renderer Canvas2D (alpha-nya selalu didukung, tidak menutupi video).
const originalGetContext = OffscreenCanvas.prototype.getContext

OffscreenCanvas.prototype.getContext = function patchedGetContext(type, ...args) {
  if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
  return originalGetContext.call(this, type, ...args)
}

export {}
