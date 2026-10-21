<script setup lang="ts">
import type { HealthReport, HealthCheck } from '@acs/shared'

const { apiFetch } = useApi()
const report = ref<HealthReport | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const badgeClass: Record<HealthCheck['status'], string> = {
  ok: 'badge-ok',
  warn: 'badge-warn',
  error: 'badge-error',
}

async function loadHealth() {
  loading.value = true
  error.value = null
  try {
    report.value = await apiFetch<HealthReport>('/health')
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Gagal memuat status'
  } finally {
    loading.value = false
  }
}

onMounted(loadHealth)
</script>

<template>
  <section class="page">
    <h1 class="page-title">Auto Caption Studio</h1>
    <p class="page-sub">
      Caption otomatis bergaya CapCut, diproses lokal di mesin ini. Halaman proyek dan editor
      menyusul pada milestone berikutnya.
    </p>

    <div class="card">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px">
        <h2 style="margin: 0; font-size: 16px">Status dependensi</h2>
        <button class="btn" :disabled="loading" @click="loadHealth">
          {{ loading ? 'Memeriksa…' : 'Periksa ulang' }}
        </button>
      </div>

      <p v-if="error" class="badge badge-error" style="margin-top: 12px; display: inline-flex">
        API tidak terjangkau: {{ error }}
      </p>

      <div v-else-if="loading && !report" class="muted" style="margin-top: 12px">
        Menjalankan pemeriksaan…
      </div>

      <div v-else-if="report" style="margin-top: 8px">
        <div v-for="check in report.checks" :key="check.name" class="status-row">
          <span class="badge" :class="badgeClass[check.status]">
            {{ check.status === 'ok' ? 'OK' : check.status === 'warn' ? 'WARN' : 'FAIL' }}
          </span>
          <div style="flex: 1">
            <div style="font-weight: 600">
              {{ check.name }}
              <span v-if="check.version" class="muted mono">({{ check.version }})</span>
            </div>
            <div class="muted" style="font-size: 13px">{{ check.detail }}</div>
          </div>
        </div>

        <div class="muted mono" style="margin-top: 12px; line-height: 1.6">
          <div>DATA_DIR: {{ report.env.dataDir }}</div>
          <div>FONTS_DIR: {{ report.env.fontsDir }}</div>
          <div>
            Whisper: {{ report.env.whisperModel }} ({{ report.env.whisperDevice }},
            {{ report.env.whisperCompute }})
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
