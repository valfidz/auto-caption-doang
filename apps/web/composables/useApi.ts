import type { ProjectDto } from '@acs/shared'

export interface ApiError {
  statusCode: number
  message: string
}

export function useApi() {
  const config = useRuntimeConfig()
  const base = String(config.public.apiBase).replace(/\/+$/, '')

  async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${base}${path}`, {
        ...options,
        headers: {
          ...(options.body && !(options.body instanceof FormData)
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...(options.headers ?? {}),
        },
      })
    } catch {
      // statusCode 0 = gagal di level jaringan (API mati/restart), bukan respons HTTP.
      throw {
        statusCode: 0,
        message: 'Tidak dapat terhubung ke API. Server mungkin sedang restart.',
      } satisfies ApiError
    }
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`
      try {
        const data = (await response.json()) as { message?: string | string[] }
        if (data?.message) {
          message = Array.isArray(data.message) ? data.message.join(', ') : data.message
        }
      } catch {
        /* biarkan pesan default */
      }
      throw { statusCode: response.status, message } satisfies ApiError
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  function videoUrl(projectId: string): string {
    return `${base}/projects/${projectId}/video`
  }

  function downloadUrl(projectId: string): string {
    return `${base}/projects/${projectId}/export/download`
  }

  return { base, apiFetch, videoUrl, downloadUrl }
}

/**
 * Unggah video lewat XMLHttpRequest agar progres transfer bisa ditampilkan
 * (fetch tidak menyediakan event progres unggah).
 */
export function uploadProject(
  file: File,
  options: { language: string; title?: string },
  onProgress?: (fraction: number) => void,
): Promise<ProjectDto> {
  const config = useRuntimeConfig()
  const base = String(config.public.apiBase).replace(/\/+$/, '')

  return new Promise<ProjectDto>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${base}/projects`)

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total)
    })

    xhr.addEventListener('load', () => {
      let payload: unknown = null
      try {
        payload = JSON.parse(xhr.responseText)
      } catch {
        payload = null
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload as ProjectDto)
        return
      }
      const message =
        (payload as { message?: string | string[] } | null)?.message ?? `HTTP ${xhr.status}`
      reject({
        statusCode: xhr.status,
        message: Array.isArray(message) ? message.join(', ') : message,
      } satisfies ApiError)
    })
    xhr.addEventListener('error', () =>
      reject({ statusCode: 0, message: 'Koneksi ke API gagal.' } satisfies ApiError),
    )
    xhr.addEventListener('abort', () =>
      reject({ statusCode: 0, message: 'Unggahan dibatalkan.' } satisfies ApiError),
    )

    const form = new FormData()
    form.append('file', file, file.name)
    form.append('language', options.language)
    if (options.title) form.append('title', options.title)
    xhr.send(form)
  })
}
