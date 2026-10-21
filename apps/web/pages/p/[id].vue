<script setup lang="ts">
import type { ProjectDto } from '@acs/shared'

const route = useRoute()
const { apiFetch, videoUrl } = useApi()

const projectId = computed(() => String(route.params.id))
const project = ref<ProjectDto | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

const videoSrc = computed(() => (project.value ? videoUrl(project.value.id) : ''))
const longVideo = computed(() => (project.value?.durationSec ?? 0) > 300)

async function load() {
  loading.value = true
  error.value = null
  try {
    project.value = await apiFetch<ProjectDto>(`/projects/${projectId.value}`)
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Gagal memuat proyek'
  } finally {
    loading.value = false
  }
}

onMounted(load)

useHead(() => ({ title: project.value ? `${project.value.title} — Auto Caption Studio` : 'Proyek' }))
</script>

<template>
  <section class="page">
    <p v-if="error" class="banner banner-error">{{ error }}</p>
    <p v-else-if="loading" class="muted">Memuat proyek…</p>

    <template v-else-if="project">
      <div class="editor-header">
        <div>
          <h1 class="page-title">{{ project.title }}</h1>
          <p class="page-sub" style="margin-bottom: 0">
            {{ aspectLabel(project.width, project.height) }} · {{ project.width }}×{{
              project.height
            }}
            · {{ formatDuration(project.durationSec) }} · {{ project.fps }} fps
            <span v-if="!project.hasAudio" class="badge badge-warn">tanpa audio</span>
          </p>
        </div>
        <div class="editor-actions">
          <NuxtLink to="/" class="btn btn-ghost">← Proyek</NuxtLink>
        </div>
      </div>

      <p v-if="longVideo" class="banner banner-warn">
        Video ini panjang ({{ formatDuration(project.durationSec) }}). Transkripsi bisa memakan
        beberapa menit.
      </p>

      <div class="preview-card">
        <video :src="videoSrc" controls preload="metadata" class="preview-video" />
      </div>

      <p class="muted" style="margin-top: 16px; font-size: 13px">
        Editor caption (transkripsi, daftar caption, style, export) tersedia pada milestone
        berikutnya.
      </p>
    </template>
  </section>
</template>
