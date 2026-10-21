export interface ApiError {
  statusCode: number
  message: string
}

export function useApi() {
  const config = useRuntimeConfig()
  const base = String(config.public.apiBase).replace(/\/+$/, '')

  async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(options.headers ?? {}),
      },
    })
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

  return { base, apiFetch }
}
