<script setup lang="ts">
import type { HealthReport, Language, ProjectDto } from '@acs/shared'

const { apiFetch } = useApi()
const router = useRouter()

const projects = ref<ProjectDto[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const uploading = ref(false)
const uploadProgress = ref(0)
const dragging = ref(false)
const language = ref<Language>('en')
const uploadError = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const health = ref<HealthReport | null>(null)
const healthError = ref<string | null>(null)
const healthDismissed = ref(false)
const healthWarnings = computed(
  () => health.value?.checks.filter((check) => check.status !== 'ok') ?? [],
)

const ACCEPTED = ['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi']

async function loadProjects() {
  loading.value = true
  error.value = null
  try {
    projects.value = await apiFetch<ProjectDto[]>('/projects')
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Gagal memuat proyek'
  } finally {
    loading.value = false
  }
}

async function loadHealth() {
  try {
    health.value = await apiFetch<HealthReport>('/health')
    healthError.value = null
  } catch (err) {
    healthError.value = (err as { message?: string }).message ?? 'API tidak terjangkau'
  }
}

function openPicker() {
  if (uploading.value) return
  fileInput.value?.click()
}

function isAccepted(file: File): boolean {
  const name = file.name.toLowerCase()
  return ACCEPTED.some((ext) => name.endsWith(ext))
}

async function startUpload(file: File) {
  if (uploading.value) return
  uploadError.value = null
  if (!isAccepted(file)) {
    uploadError.value = `Format ${file.name.split('.').pop()} tidak didukung. Gunakan MP4, MOV, MKV, WebM.`
    return
  }
  uploading.value = true
  uploadProgress.value = 0
  try {
    const project = await uploadProject(file, { language: language.value }, (fraction) => {
      uploadProgress.value = fraction
    })
    await router.push(`/p/${project.id}`)
  } catch (err) {
    uploadError.value = (err as { message?: string }).message ?? 'Unggahan gagal'
  } finally {
    uploading.value = false
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void startUpload(file)
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) void startUpload(file)
}

async function removeProject(project: ProjectDto) {
  const confirmed = window.confirm(`Hapus proyek "${project.title}"? Berkas video ikut terhapus.`)
  if (!confirmed) return
  try {
    await apiFetch<void>(`/projects/${project.id}`, { method: 'DELETE' })
    projects.value = projects.value.filter((item) => item.id !== project.id)
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Gagal menghapus proyek'
  }
}

onMounted(loadProjects)
onMounted(loadHealth)
</script>

<template>
  <section class="page">
    <h1 class="page-title">Proyek</h1>
    <p class="page-sub">
      Unggah video, lalu transkripsi dan atur caption. Semua diproses lokal di mesin ini.
    </p>

    <div v-if="healthError" class="banner banner-error" style="margin-bottom: 16px">
      {{ healthError }} — pastikan API berjalan (`pnpm dev`).
    </div>
    <div
      v-else-if="healthWarnings.length > 0 && !healthDismissed"
      class="banner banner-warn"
      style="margin-bottom: 16px; display: flex; gap: 12px; align-items: flex-start"
    >
      <div style="flex: 1">
        <strong>Perhatian lingkungan:</strong>
        <ul style="margin: 6px 0 0 18px; padding: 0">
          <li v-for="check in healthWarnings" :key="check.name">
            {{ check.name }} — {{ check.detail }}
          </li>
        </ul>
      </div>
      <button class="btn btn-ghost btn-sm" style="margin: 0" @click="healthDismissed = true">
        Tutup
      </button>
    </div>

    <div class="card upload-card">
      <div
        class="upload-zone"
        :class="{ dragging, disabled: uploading }"
        role="button"
        tabindex="0"
        @click="openPicker"
        @keydown.enter.prevent="openPicker"
        @keydown.space.prevent="openPicker"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <input
          ref="fileInput"
          type="file"
          class="hidden-input"
          :accept="ACCEPTED.join(',')"
          @change="onFileChange"
        />
        <template v-if="!uploading">
          <div class="upload-icon">⬆</div>
          <div class="upload-title">Tarik video ke sini atau klik untuk memilih</div>
          <div class="muted" style="font-size: 13px">MP4 · MOV · MKV · WebM — tanpa batas durasi</div>
        </template>
        <template v-else>
          <div class="upload-title">Mengunggah… {{ Math.round(uploadProgress * 100) }}%</div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${uploadProgress * 100}%` }" />
          </div>
        </template>
      </div>

      <div class="upload-options">
        <label class="field">
          <span>Bahasa ucapan</span>
          <select v-model="language" :disabled="uploading">
            <option value="en">English (default)</option>
            <option value="id">Indonesia</option>
            <option value="auto">Auto-detect</option>
          </select>
        </label>
        <p class="muted" style="font-size: 13px; margin: 0">
          Bahasa dipakai saat transkripsi dimulai dan masih bisa diubah di editor.
        </p>
      </div>

      <p v-if="uploadError" class="banner banner-error">{{ uploadError }}</p>
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between; margin: 28px 0 12px">
      <h2 style="font-size: 16px; margin: 0">Daftar proyek</h2>
      <button class="btn btn-ghost" :disabled="loading" @click="loadProjects">Muat ulang</button>
    </div>

    <p v-if="error" class="banner banner-error">{{ error }}</p>
    <p v-else-if="loading" class="muted">Memuat…</p>
    <p v-else-if="projects.length === 0" class="muted">
      Belum ada proyek. Unggah video pertama Anda di atas.
    </p>

    <div v-else class="project-grid">
      <article v-for="project in projects" :key="project.id" class="project-card">
        <NuxtLink :to="`/p/${project.id}`" class="project-link">
          <div class="project-title">{{ project.title }}</div>
          <div class="project-meta mono">
            {{ aspectLabel(project.width, project.height) }} · {{ project.width }}×{{
              project.height
            }}
            · {{ formatDuration(project.durationSec) }} · {{ project.fps }} fps
          </div>
          <div class="project-meta muted">{{ formatDate(project.createdAt) }}</div>
        </NuxtLink>
        <div class="project-actions">
          <span class="badge" :class="`badge-${project.status === 'ready' ? 'ok' : 'warn'}`">
            {{ project.status }}
          </span>
          <button class="btn btn-ghost btn-danger" @click="removeProject(project)">Hapus</button>
        </div>
      </article>
    </div>
  </section>
</template>
