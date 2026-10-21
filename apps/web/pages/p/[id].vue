<script setup lang="ts">
import type { JobDto, Language, ProjectDto } from '@acs/shared'

const route = useRoute()
const { apiFetch, videoUrl, downloadUrl } = useApi()

const projectId = computed(() => String(route.params.id))
const project = ref<ProjectDto | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

const videoEl = ref<HTMLVideoElement | null>(null)
const currentTime = ref(0)

const language = ref<Language>('en')
const job = ref<JobDto | null>(null)
const jobError = ref<string | null>(null)
const starting = ref(false)

const exportJob = ref<JobDto | null>(null)
const exportError = ref<string | null>(null)
const exportStarting = ref(false)
const hasExport = ref(false)

let pollTimer: ReturnType<typeof setTimeout> | null = null
let exportPollTimer: ReturnType<typeof setTimeout> | null = null

const videoSrc = computed(() => (project.value ? videoUrl(project.value.id) : ''))
const longVideo = computed(() => (project.value?.durationSec ?? 0) > 300)
const transcribing = computed(
  () => job.value !== null && (job.value.status === 'queued' || job.value.status === 'running'),
)
const exporting = computed(
  () =>
    exportJob.value !== null &&
    (exportJob.value.status === 'queued' || exportJob.value.status === 'running'),
)
const words = computed(() => project.value?.transcript?.words ?? [])
const groupSize = computed(() => project.value?.style?.maxWordsPerGroup ?? 4)
const downloadHref = computed(() => downloadUrl(projectId.value))

async function loadProject() {
  error.value = null
  try {
    project.value = await apiFetch<ProjectDto>(`/projects/${projectId.value}`)
    if (project.value?.language && project.value.language !== 'auto') {
      language.value = project.value.language as Language
    }
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Gagal memuat proyek'
  } finally {
    loading.value = false
  }
}

async function resumeJobs() {
  try {
    const jobs = await apiFetch<JobDto[]>(`/projects/${projectId.value}/jobs`)
    const activeTranscribe = jobs.find(
      (item) => item.type === 'transcribe' && (item.status === 'queued' || item.status === 'running'),
    )
    if (activeTranscribe) {
      job.value = activeTranscribe
      void pollJob(activeTranscribe.id)
    } else if (jobs.find((item) => item.type === 'transcribe')?.status === 'failed') {
      jobError.value = jobs.find((item) => item.type === 'transcribe')?.error ?? null
    }

    const activeExport = jobs.find(
      (item) => item.type === 'export' && (item.status === 'queued' || item.status === 'running'),
    )
    if (activeExport) {
      exportJob.value = activeExport
      void pollExport(activeExport.id)
    }
    hasExport.value = jobs.some((item) => item.type === 'export' && item.status === 'done')
  } catch {
    /* halaman tetap bisa dipakai */
  }
}

async function startTranscription() {
  if (starting.value || transcribing.value) return
  starting.value = true
  jobError.value = null
  try {
    job.value = await apiFetch<JobDto>(`/projects/${projectId.value}/transcribe`, {
      method: 'POST',
      body: JSON.stringify({ language: language.value }),
    })
    void pollJob(job.value.id)
  } catch (err) {
    jobError.value = (err as { message?: string }).message ?? 'Gagal memulai transkripsi'
  } finally {
    starting.value = false
  }
}

async function pollJob(jobId: string) {
  if (pollTimer) clearTimeout(pollTimer)
  try {
    const latest = await apiFetch<JobDto>(`/jobs/${jobId}`)
    job.value = latest
    if (latest.status === 'done') {
      await loadProject()
      return
    }
    if (latest.status === 'failed' || latest.status === 'canceled') {
      jobError.value = latest.error ?? 'Transkripsi tidak selesai'
      await loadProject()
      return
    }
  } catch (err) {
    jobError.value = (err as { message?: string }).message ?? 'Gagal membaca status job'
    return
  }
  pollTimer = setTimeout(() => void pollJob(jobId), 800)
}

async function cancelJob() {
  if (!job.value) return
  try {
    job.value = await apiFetch<JobDto>(`/jobs/${job.value.id}/cancel`, { method: 'POST' })
    jobError.value = 'Transkripsi dibatalkan.'
  } catch (err) {
    jobError.value = (err as { message?: string }).message ?? 'Gagal membatalkan job'
  }
}

async function startExport() {
  if (exportStarting.value || exporting.value) return
  exportStarting.value = true
  exportError.value = null
  try {
    exportJob.value = await apiFetch<JobDto>(`/projects/${projectId.value}/export`, {
      method: 'POST',
    })
    hasExport.value = false
    void pollExport(exportJob.value.id)
  } catch (err) {
    exportError.value = (err as { message?: string }).message ?? 'Gagal memulai export'
  } finally {
    exportStarting.value = false
  }
}

async function pollExport(jobId: string) {
  if (exportPollTimer) clearTimeout(exportPollTimer)
  try {
    const latest = await apiFetch<JobDto>(`/jobs/${jobId}`)
    exportJob.value = latest
    if (latest.status === 'done') {
      hasExport.value = true
      await loadProject()
      return
    }
    if (latest.status === 'failed' || latest.status === 'canceled') {
      exportError.value = latest.error ?? 'Export tidak selesai'
      return
    }
  } catch (err) {
    exportError.value = (err as { message?: string }).message ?? 'Gagal membaca status export'
    return
  }
  exportPollTimer = setTimeout(() => void pollExport(jobId), 700)
}

async function cancelExport() {
  if (!exportJob.value) return
  try {
    exportJob.value = await apiFetch<JobDto>(`/jobs/${exportJob.value.id}/cancel`, {
      method: 'POST',
    })
    exportError.value = 'Export dibatalkan.'
  } catch (err) {
    exportError.value = (err as { message?: string }).message ?? 'Gagal membatalkan export'
  }
}

function seekTo(seconds: number) {
  currentTime.value = seconds
  if (videoEl.value) {
    videoEl.value.currentTime = seconds
    void videoEl.value.play().catch(() => undefined)
  }
}

function onTimeUpdate() {
  if (videoEl.value) currentTime.value = videoEl.value.currentTime
}

function formatSeconds(value: number): string {
  const total = Math.floor(value)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

onMounted(async () => {
  await loadProject()
  await resumeJobs()
})

onBeforeUnmount(() => {
  if (pollTimer) clearTimeout(pollTimer)
  if (exportPollTimer) clearTimeout(exportPollTimer)
})

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
          <a
            v-if="hasExport && !exporting"
            :href="downloadHref"
            class="btn btn-primary"
            download
          >
            Unduh MP4
          </a>
          <button
            v-else
            class="btn btn-primary"
            :disabled="!project.transcript || exporting || exportStarting"
            :title="project.transcript ? '' : 'Transkripsi dulu sebelum export'"
            @click="startExport"
          >
            {{ exporting ? 'Export…' : 'Export MP4' }}
          </button>
        </div>
      </div>

      <p v-if="longVideo && !project.transcript" class="banner banner-warn">
        Video ini panjang ({{ formatDuration(project.durationSec) }}). Transkripsi bisa memakan
        beberapa menit — progres akan tampil di bawah.
      </p>

      <div class="editor-grid">
        <div class="editor-preview">
          <div class="preview-card">
            <video
              ref="videoEl"
              :src="videoSrc"
              controls
              preload="metadata"
              class="preview-video"
              @timeupdate="onTimeUpdate"
            />
          </div>
          <div class="muted mono" style="margin-top: 8px; font-size: 12px">
            {{ formatSeconds(currentTime) }} / {{ formatDuration(project.durationSec) }}
          </div>
        </div>

        <aside class="editor-side">
          <div class="card">
            <h2 class="panel-title">Transkripsi</h2>

            <div v-if="!project.hasAudio" class="banner banner-warn">
              Video ini tidak memiliki audio.
            </div>

            <template v-else>
              <div class="row-gap">
                <label class="field" style="flex: 1">
                  <span>Bahasa</span>
                  <select v-model="language" :disabled="transcribing">
                    <option value="en">English (default)</option>
                    <option value="id">Indonesia</option>
                    <option value="auto">Auto-detect</option>
                  </select>
                </label>
                <button
                  v-if="!transcribing"
                  class="btn btn-primary"
                  :disabled="starting"
                  @click="startTranscription"
                >
                  {{ project.transcript ? 'Transkripsi ulang' : 'Mulai transkripsi' }}
                </button>
              </div>

              <div v-if="transcribing && job" class="job-progress">
                <div class="job-progress-head">
                  <span>{{
                    job.status === 'queued' ? 'Menunggu antrean…' : 'Transkripsi berjalan…'
                  }}</span>
                  <span class="mono">{{ Math.round(job.progress * 100) }}%</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill" :style="{ width: `${job.progress * 100}%` }" />
                </div>
                <button class="btn btn-ghost btn-sm" @click="cancelJob">Batalkan</button>
              </div>

              <p v-if="jobError" class="banner banner-error" style="margin-top: 12px">
                {{ jobError }}
              </p>

              <p v-if="project.transcript" class="muted" style="font-size: 13px; margin-top: 12px">
                {{ words.length }} kata · bahasa {{ project.transcript.language }} · maks
                {{ groupSize }} kata per layar
              </p>
            </template>
          </div>

          <div v-if="project.transcript" class="card" style="margin-top: 12px">
            <h2 class="panel-title">Export</h2>
            <p v-if="!exporting && !hasExport" class="muted" style="font-size: 13px; margin: 0">
              Render caption menempel ke MP4 (H.264, NVENC dengan fallback CPU).
            </p>
            <div v-if="exporting && exportJob" class="job-progress" style="margin-top: 4px">
              <div class="job-progress-head">
                <span>{{
                  exportJob.status === 'queued' ? 'Menunggu antrean…' : 'Merender MP4…'
                }}</span>
                <span class="mono">{{ Math.round(exportJob.progress * 100) }}%</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" :style="{ width: `${exportJob.progress * 100}%` }" />
              </div>
              <button class="btn btn-ghost btn-sm" @click="cancelExport">Batalkan</button>
            </div>
            <p v-if="exportError" class="banner banner-error" style="margin-top: 12px">
              {{ exportError }}
            </p>
            <div v-if="hasExport && !exporting" style="margin-top: 8px">
              <a :href="downloadHref" class="btn btn-primary" download>Unduh MP4</a>
            </div>
          </div>

          <div v-if="words.length > 0" class="card" style="margin-top: 12px">
            <h2 class="panel-title">Kata (klik untuk loncat)</h2>
            <div class="word-list">
              <button
                v-for="word in words"
                :key="word.id"
                class="word-chip"
                :class="{ active: currentTime >= word.start && currentTime < word.end }"
                :title="`${word.start.toFixed(2)}s – ${word.end.toFixed(2)}s`"
                @click="seekTo(word.start)"
              >
                <span class="word-time mono">{{ word.start.toFixed(2) }}</span>
                <span>{{ word.text }}</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </template>
  </section>
</template>
