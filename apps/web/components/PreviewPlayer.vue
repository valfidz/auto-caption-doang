<script setup lang="ts">
import type { FontInfo } from '@acs/shared'

const props = defineProps<{
  src: string
  ass: string
  fonts: FontInfo[]
  fontBase: string
  defaultFont: string
  posX: number
  posY: number
  showHandle: boolean
}>()

const emit = defineEmits<{ time: [number]; movePosition: [number, number] }>()

const videoEl = ref<HTMLVideoElement | null>(null)
const rendererError = ref<string | null>(null)
const overlayReady = ref(false)
const dragging = ref(false)

let instance: { renderer: { setTrack(content: string): Promise<void> } | null; destroy(): Promise<void> } | null =
  null

const fontMap = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const font of props.fonts) {
    map[font.family] = `${props.fontBase}${encodeURIComponent(font.file)}`
  }
  return map
})

const handleStyle = computed(() => ({
  left: `${props.posX}%`,
  top: `${props.posY}%`,
}))

async function waitForMetadata(video: HTMLVideoElement) {
  if (video.readyState >= 1 && video.videoWidth > 0) return
  await new Promise<void>((resolve) => {
    const done = () => {
      video.removeEventListener('loadedmetadata', done)
      resolve()
    }
    video.addEventListener('loadedmetadata', done, { once: true })
  })
}

async function ensureRenderer() {
  if (instance || !videoEl.value || !props.ass) return
  try {
    await waitForMetadata(videoEl.value)
    const { createCaptionRenderer } = await import('~/composables/useCaptionRenderer')
    instance = await createCaptionRenderer({
      video: videoEl.value,
      ass: props.ass,
      fonts: fontMap.value,
      defaultFont: props.defaultFont,
    })
    await (instance as unknown as { resize(force?: boolean): Promise<void> }).resize(true)
    overlayReady.value = true
    rendererError.value = null
  } catch (err) {
    rendererError.value =
      err instanceof Error ? err.message : 'Renderer caption (JASSUB) gagal dimuat.'
  }
}

async function pushTrack(ass: string) {
  if (!instance || !ass) return
  try {
    await instance.renderer?.setTrack(ass)
  } catch (err) {
    rendererError.value = err instanceof Error ? err.message : 'Gagal memperbarui caption.'
  }
}

function seek(seconds: number) {
  if (!videoEl.value) return
  videoEl.value.currentTime = Math.max(0, seconds)
}

function togglePlay() {
  if (!videoEl.value) return
  if (videoEl.value.paused) void videoEl.value.play().catch(() => undefined)
  else videoEl.value.pause()
}

function onTimeUpdate() {
  if (videoEl.value) emit('time', videoEl.value.currentTime)
}

function positionFromPointer(event: PointerEvent): { x: number; y: number } {
  const video = videoEl.value
  if (!video) return { x: props.posX, y: props.posY }
  const rect = video.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return { x: props.posX, y: props.posY }

  let x = ((event.clientX - rect.left) / rect.width) * 100
  let y = ((event.clientY - rect.top) / rect.height) * 100
  x = Math.min(100, Math.max(0, x))
  y = Math.min(100, Math.max(0, y))
  // Snap ke tengah horizontal.
  if (Math.abs(x - 50) <= 2) x = 50
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
}

function onHandleDown(event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  dragging.value = true
  ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
}

function onHandleMove(event: PointerEvent) {
  if (!dragging.value) return
  const { x, y } = positionFromPointer(event)
  emit('movePosition', x, y)
}

function onHandleUp(event: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  const { x, y } = positionFromPointer(event)
  emit('movePosition', x, y)
}

watch(
  () => props.ass,
  async (ass) => {
    if (!ass) return
    if (!instance) await ensureRenderer()
    else await pushTrack(ass)
  },
)

watch(
  () => props.src,
  async () => {
    if (instance) {
      await instance.destroy().catch(() => undefined)
      instance = null
      overlayReady.value = false
    }
    await nextTick()
    await ensureRenderer()
  },
)

onMounted(async () => {
  await nextTick()
  await ensureRenderer()
})

onBeforeUnmount(async () => {
  if (instance) await instance.destroy().catch(() => undefined)
  instance = null
})

defineExpose({ seek, togglePlay })
</script>

<template>
  <div class="preview-wrap">
    <div class="preview-stage">
      <div class="video-box">
        <video
          ref="videoEl"
          :src="props.src"
          crossorigin="anonymous"
          controls
          preload="metadata"
          class="preview-video"
          @timeupdate="onTimeUpdate"
          @seeked="onTimeUpdate"
          @play="onTimeUpdate"
        />
        <div
          v-if="props.showHandle"
          class="caption-handle"
          :class="{ 'caption-handle-dragging': dragging }"
          :style="handleStyle"
          title="Geser posisi caption"
          @pointerdown="onHandleDown"
          @pointermove="onHandleMove"
          @pointerup="onHandleUp"
          @pointercancel="onHandleUp"
        >
          ⊕
        </div>
      </div>
    </div>
    <p v-if="rendererError" class="banner banner-warn" style="margin-top: 10px">
      Preview caption tidak aktif: {{ rendererError }}
    </p>
    <p v-else-if="!overlayReady" class="muted" style="margin-top: 8px; font-size: 12px">
      Menyiapkan renderer caption…
    </p>
  </div>
</template>
