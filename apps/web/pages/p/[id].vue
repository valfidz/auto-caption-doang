<script setup lang="ts">
import {
  DEFAULT_STYLE,
  buildGroups,
  createFallbackMeasurer,
  createMeasurer,
  deleteWordAt,
  generateAss,
  joinWithNext,
  splitWord,
  updateWordText,
  type CaptionGroup,
  type FontInfo,
  type JobDto,
  type Language,
  type Measurer,
  type ProjectDto,
  type Word,
} from '@acs/shared'

import PreviewPlayer from '~/components/PreviewPlayer.vue'

const route = useRoute()
const { base, apiFetch, videoUrl, downloadUrl } = useApi()

const projectId = computed(() => String(route.params.id))

const project = ref<ProjectDto | null>(null)
const words = ref<Word[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const measurer = shallowRef<Measurer | null>(null)
const fontWarning = ref<string | null>(null)
const fonts = ref<FontInfo[]>([])
const fontBase = computed(() => `${base}/fonts/`)

const groups = ref<CaptionGroup[]>([])
const ass = ref('')
const currentTime = ref(0)
const selectedWordId = ref<string | null>(null)

const previewRef = ref<InstanceType<typeof PreviewPlayer> | null>(null)

const language = ref<Language>('en')
const job = ref<JobDto | null>(null)
const jobError = ref<string | null>(null)
const starting = ref(false)

const exportJob = ref<JobDto | null>(null)
const exportError = ref<string | null>(null)
const exportStarting = ref(false)
const hasExport = ref(false)

const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveError = ref<string | null>(null)
let saveTimer: ReturnType<typeof setTimeout> | null = null
// Mencegah respons simpan yang lebih lama menimpa editan yang lebih baru.
let saveSequence = 0

let pollTimer: ReturnType<typeof setTimeout> | null = null
let exportPollTimer: ReturnType<typeof setTimeout> | null = null

const style = computed(() => project.value?.style ?? DEFAULT_STYLE)
const videoSize = computed(() => ({
  width: project.value?.width ?? 1080,
  height: project.value?.height ?? 1920,
}))
const videoSrc = computed(() => (project.value ? videoUrl(project.value.id) : ''))
const downloadHref = computed(() => downloadUrl(projectId.value))

const transcribing = computed(
  () => job.value !== null && (job.value.status === 'queued' || job.value.status === 'running'),
)
const exporting = computed(
  () =>
    exportJob.value !== null &&
    (exportJob.value.status === 'queued' || exportJob.value.status === 'running'),
)
const selectedWord = computed(() => words.value.find((word) => word.id === selectedWordId.value) ?? null)
const activeWordId = computed(() => {
  const time = currentTime.value
  const found = words.value.find((word) => time >= word.start && time < word.end)
  return found?.id ?? null
})
const activeGroupIndex = computed(() =>
  groups.value.findIndex((group) => currentTime.value >= group.start - 0.01 && currentTime.value <= group.end + 0.01),
)

function rebuild() {
  if (!project.value || words.value.length === 0) {
    groups.value = []
    ass.value = ''
    return
  }
  const engine = measurer.value ?? createFallbackMeasurer()
  groups.value = buildGroups(words.value, style.value, videoSize.value, engine)
  ass.value = generateAss(groups.value, style.value, videoSize.value)
}

async function loadProject() {
  try {
    const data = await apiFetch<ProjectDto>(`/projects/${projectId.value}`)
    project.value = data
    words.value = data.transcript?.words ?? []
    if (data.language && data.language !== 'auto') language.value = data.language as Language
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Gagal memuat proyek'
  } finally {
    loading.value = false
  }
}

async function loadFonts() {
  try {
    fonts.value = await apiFetch<FontInfo[]>('/fonts')
  } catch {
    fonts.value = []
  }
  try {
    const response = await fetch(`${fontBase.value}${encodeURIComponent(style.value.fontFile)}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    measurer.value = createMeasurer(await response.arrayBuffer())
    fontWarning.value = null
  } catch {
    measurer.value = null
    fontWarning.value = `Font ${style.value.fontFile} tidak dapat dimuat; pengukuran lebar memakai perkiraan.`
  }
  rebuild()
}

function scheduleSave() {
  saveState.value = 'saving'
  saveError.value = null
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveTranscript(), 650)
}

async function saveTranscript() {
  if (!project.value) return
  const sequence = (saveSequence += 1)
  try {
    const updated = await apiFetch<ProjectDto>(`/projects/${projectId.value}/transcript`, {
      method: 'PUT',
      body: JSON.stringify({
        words: words.value,
        language: project.value.transcript?.language,
      }),
    })
    if (sequence !== saveSequence) return // sudah ada editan yang lebih baru
    project.value = updated
    words.value = updated.transcript?.words ?? words.value
    if (selectedWordId.value && !words.value.some((w) => w.id === selectedWordId.value)) {
      selectedWordId.value = null
    }
    saveState.value = 'saved'
    rebuild()
  } catch (err) {
    if (sequence !== saveSequence) return
    saveState.value = 'error'
    saveError.value = (err as { message?: string }).message ?? 'Gagal menyimpan transkrip'
  }
}

function wordIndex(id: string): number {
  return words.value.findIndex((word) => word.id === id)
}

function onSelect(id: string) {
  selectedWordId.value = id
}

function onRename(id: string, text: string) {
  const index = wordIndex(id)
  if (index < 0) return
  words.value = updateWordText(words.value, index, text)
  rebuild()
  scheduleSave()
}

function onJoin(id: string) {
  const index = wordIndex(id)
  if (index < 0) return
  const target = index < words.value.length - 1 ? index : index - 1
  if (target < 0) return
  const mergedId = words.value[target].id
  words.value = joinWithNext(words.value, target)
  selectedWordId.value = mergedId
  rebuild()
  scheduleSave()
}

function onSplit(id: string) {
  const index = wordIndex(id)
  if (index < 0) return
  words.value = splitWord(words.value, index)
  rebuild()
  scheduleSave()
}

function onRemove(id: string) {
  const index = wordIndex(id)
  if (index < 0 || words.value.length <= 1) return
  words.value = deleteWordAt(words.value, index)
  selectedWordId.value = null
  rebuild()
  scheduleSave()
}

function onSeek(seconds: number) {
  currentTime.value = seconds
  previewRef.value?.seek(seconds)
}

function onTime(time: number) {
  currentTime.value = time
}

function togglePlay() {
  previewRef.value?.togglePlay()
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
      selectedWordId.value = null
      rebuild()
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
  if (exportStarting.value || exporting.value || !project.value?.transcript) return
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

async function resumeJobs() {
  try {
    const jobs = await apiFetch<JobDto[]>(`/projects/${projectId.value}/jobs`)
    const activeTranscribe = jobs.find(
      (item) => item.type === 'transcribe' && (item.status === 'queued' || item.status === 'running'),
    )
    if (activeTranscribe) {
      job.value = activeTranscribe
      void pollJob(activeTranscribe.id)
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

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  ) {
    return
  }
  if (event.code === 'Space') {
    event.preventDefault()
    togglePlay()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    onSeek(Math.max(0, currentTime.value - 1))
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    onSeek(Math.min(project.value?.durationSec ?? currentTime.value + 1, currentTime.value + 1))
  }
}

onMounted(async () => {
  await loadProject()
  rebuild()
  await loadFonts()
  await resumeJobs()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (pollTimer) clearTimeout(pollTimer)
  if (exportPollTimer) clearTimeout(exportPollTimer)
  if (saveTimer) clearTimeout(saveTimer)
})

useHead(() => ({ title: project.value ? `${project.value.title} — Auto Caption Studio` : 'Proyek' }))
</script>

<template>
  <section class="editor-page">
    <p v-if="error" class="banner banner-error">{{ error }}</p>
    <p v-else-if="loading" class="muted" style="padding: 24px">Memuat proyek…</p>

    <template v-else-if="project">
      <header class="editor-topbar">
        <div class="editor-title">
          <NuxtLink to="/" class="btn btn-ghost btn-sm-link">←</NuxtLink>
          <div>
            <h1 class="page-title" style="font-size: 18px; margin: 0">{{ project.title }}</h1>
            <p class="muted mono" style="margin: 2px 0 0; font-size: 12px">
              {{ aspectLabel(project.width, project.height) }} · {{ project.width }}×{{
                project.height
              }}
              · {{ formatDuration(project.durationSec) }} · {{ project.fps }} fps
            </p>
          </div>
        </div>
        <div class="editor-actions">
          <a v-if="hasExport && !exporting" :href="downloadHref" class="btn btn-primary" download>
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
      </header>

      <div v-if="exporting && exportJob" class="export-strip">
        <span class="mono">Export {{ Math.round(exportJob.progress * 100) }}%</span>
        <div class="progress-track" style="flex: 1">
          <div class="progress-fill" :style="{ width: `${exportJob.progress * 100}%` }" />
        </div>
        <button class="btn btn-ghost btn-sm" @click="cancelExport">Batalkan</button>
      </div>
      <p v-if="exportError" class="banner banner-error" style="margin: 8px 16px">{{ exportError }}</p>

      <div class="editor-workspace">
        <div class="editor-main">
          <PreviewPlayer
            ref="previewRef"
            :src="videoSrc"
            :ass="ass"
            :fonts="fonts"
            :font-base="fontBase"
            :default-font="style.fontFamily"
            @time="onTime"
          />
          <p v-if="fontWarning" class="banner banner-warn" style="margin-top: 10px">
            {{ fontWarning }}
          </p>
          <p v-if="!project.transcript" class="muted" style="margin-top: 12px; font-size: 13px">
            Belum ada caption. Mulai transkripsi di panel kanan.
          </p>
        </div>

        <aside class="editor-panel">
          <div class="panel-tabs">
            <button class="tab tab-active">Captions</button>
          </div>

          <div class="panel-scroll">
            <div v-if="!project.hasAudio" class="banner banner-warn" style="margin: 12px">
              Video ini tidak memiliki audio.
            </div>

            <template v-else-if="!project.transcript || words.length === 0">
              <div class="card" style="margin: 12px">
                <h2 class="panel-title">Transkripsi</h2>
                <label class="field">
                  <span>Bahasa</span>
                  <select v-model="language" :disabled="transcribing">
                    <option value="en">English (default)</option>
                    <option value="id">Indonesia</option>
                    <option value="auto">Auto-detect</option>
                  </select>
                </label>
                <button
                  class="btn btn-primary"
                  style="margin-top: 12px; width: 100%"
                  :disabled="starting || transcribing"
                  @click="startTranscription"
                >
                  {{ transcribing ? 'Transkripsi berjalan…' : 'Mulai transkripsi' }}
                </button>
              </div>
            </template>

            <template v-else>
              <div v-if="transcribing && job" class="job-progress" style="padding: 12px">
                <div class="job-progress-head">
                  <span>{{
                    job.status === 'queued' ? 'Menunggu antrean…' : 'Transkripsi ulang…'
                  }}</span>
                  <span class="mono">{{ Math.round(job.progress * 100) }}%</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill" :style="{ width: `${job.progress * 100}%` }" />
                </div>
                <button class="btn btn-ghost btn-sm" @click="cancelJob">Batalkan</button>
              </div>

              <div v-if="selectedWord" class="word-actions">
                <span class="mono" style="flex: 1; overflow: hidden; text-overflow: ellipsis">{{
                  selectedWord.text
                }}</span>
                <button class="btn btn-ghost btn-sm" @click="onJoin(selectedWord.id)">Gabung</button>
                <button class="btn btn-ghost btn-sm" @click="onSplit(selectedWord.id)">Pisah</button>
                <button class="btn btn-ghost btn-sm btn-danger" @click="onRemove(selectedWord.id)">
                  Hapus
                </button>
              </div>

              <CaptionList
                :groups="groups"
                :current-time="currentTime"
                :active-group-index="activeGroupIndex"
                :active-word-id="activeWordId"
                :selected-word-id="selectedWordId"
                @seek="onSeek"
                @select="onSelect"
                @rename="onRename"
                @join="onJoin"
                @split="onSplit"
                @remove="onRemove"
              />
            </template>

            <p v-if="jobError" class="banner banner-error" style="margin: 12px">{{ jobError }}</p>
          </div>

          <footer class="panel-footer">
            <span class="mono" style="font-size: 12px">
              {{
                saveState === 'saving'
                  ? 'Menyimpan…'
                  : saveState === 'saved'
                    ? 'Tersimpan'
                    : saveState === 'error'
                      ? 'Gagal menyimpan'
                      : `${words.length} kata`
              }}
            </span>
            <button class="btn btn-ghost btn-sm" :disabled="transcribing" @click="startTranscription">
              {{ project.transcript ? 'Transkripsi ulang' : 'Mulai transkripsi' }}
            </button>
          </footer>
          <p v-if="saveError" class="banner banner-error" style="margin: 0 12px 12px">
            {{ saveError }}
          </p>
        </aside>
      </div>
    </template>
  </section>
</template>
