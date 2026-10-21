export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: false },
  compatibilityDate: '2026-01-01',
  modules: ['@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Auto Caption Studio',
      htmlAttrs: { lang: 'id' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://127.0.0.1:3001',
    },
  },
  typescript: { strict: true },
  vite: {
    // Worker JASSUB memakai dynamic import; format IIFE tidak mendukung code-splitting.
    worker: { format: 'es' },
    server: { fs: { allow: ['..', '../..'] } },
  },
})
