<script setup lang="ts">
import {
  BUILT_IN_TEMPLATES,
  type FontInfo,
  type StyleConfig,
  type StylePresetDto,
} from '@acs/shared'

const props = defineProps<{
  style: StyleConfig
  fonts: FontInfo[]
  presets: StylePresetDto[]
  saving: boolean
  saveError: string | null
}>()

const emit = defineEmits<{
  change: [Partial<StyleConfig>]
  template: [string]
  'save-preset': [string]
  'apply-preset': [string]
  'delete-preset': [string]
  'set-default': [string]
  'reset-position': []
}>()

const selectedPreset = ref<string>('')
const presetName = ref('')
const showSavePreset = ref(false)

const currentTemplate = computed(() => props.style.templateId)
const activePreset = computed(() => props.presets.find((p) => p.id === selectedPreset.value))

function update(patch: Partial<StyleConfig>) {
  emit('change', patch)
}

function numberFromEvent(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}

function onPresetSelect(event: Event) {
  selectedPreset.value = (event.target as HTMLSelectElement).value
}

function applyPreset() {
  if (selectedPreset.value) emit('apply-preset', selectedPreset.value)
}

function savePreset() {
  const name = presetName.value.trim()
  if (!name) return
  emit('save-preset', name)
  presetName.value = ''
  showSavePreset.value = false
}

watch(
  () => props.presets,
  (list) => {
    if (!selectedPreset.value && list.length > 0) {
      selectedPreset.value = list.find((p) => p.isDefault)?.id ?? list[0].id
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="style-panel">
    <section class="style-section">
      <h3 class="panel-title">Template</h3>
      <div class="template-grid">
        <button
          v-for="template in BUILT_IN_TEMPLATES"
          :key="template.id"
          class="template-card"
          :class="{ 'template-card-active': currentTemplate === template.id }"
          :title="template.description"
          @click="emit('template', template.id)"
        >
          {{ template.name }}
        </button>
      </div>
    </section>

    <section class="style-section">
      <h3 class="panel-title">Preset</h3>
      <div class="preset-row">
        <select :value="selectedPreset" style="flex: 1" @change="onPresetSelect">
          <option v-for="preset in props.presets" :key="preset.id" :value="preset.id">
            {{ preset.name }}{{ preset.isDefault ? ' (default)' : '' }}
          </option>
        </select>
        <button class="btn btn-ghost btn-sm" :disabled="!activePreset" @click="applyPreset">
          Terapkan
        </button>
      </div>
      <div class="preset-row">
        <button class="btn btn-ghost btn-sm" @click="showSavePreset = !showSavePreset">
          Simpan sebagai…
        </button>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="!activePreset || activePreset.isDefault"
          @click="activePreset && emit('set-default', activePreset.id)"
        >
          Jadikan default
        </button>
        <button
          class="btn btn-ghost btn-sm btn-danger"
          :disabled="!activePreset || activePreset.isBuiltIn"
          @click="activePreset && emit('delete-preset', activePreset.id)"
        >
          Hapus
        </button>
      </div>
      <div v-if="showSavePreset" class="preset-row">
        <input v-model="presetName" type="text" placeholder="Nama preset" maxlength="60" />
        <button class="btn btn-primary btn-sm" :disabled="!presetName.trim()" @click="savePreset">
          Simpan
        </button>
      </div>
    </section>

    <section class="style-section">
      <h3 class="panel-title">Font</h3>
      <label class="field">
        <span>Family</span>
        <select
          :value="props.style.fontFamily"
          @change="
            update({
              fontFamily: (($event.target as HTMLSelectElement).value),
              fontFile:
                props.fonts.find(
                  (f) => f.family === ($event.target as HTMLSelectElement).value,
                )?.file ?? props.style.fontFile,
            })
          "
        >
          <option v-if="!props.fonts.some((f) => f.family === props.style.fontFamily)" :value="props.style.fontFamily">
            {{ props.style.fontFamily }}
          </option>
          <option v-for="font in props.fonts" :key="font.file" :value="font.family">
            {{ font.family }}
          </option>
        </select>
      </label>

      <label class="field" style="margin-top: 10px">
        <span>Ukuran — {{ props.style.fontSizePct.toFixed(1) }}% sisi terpendek</span>
        <input
          type="range"
          min="2"
          max="15"
          step="0.1"
          :value="props.style.fontSizePct"
          @input="update({ fontSizePct: numberFromEvent($event) })"
        />
      </label>
    </section>

    <section class="style-section">
      <h3 class="panel-title">Warna &amp; outline</h3>
      <div class="color-row">
        <label class="color-field">
          <input
            type="color"
            :value="props.style.textColor"
            @input="update({ textColor: ($event.target as HTMLInputElement).value })"
          />
          <span>Teks</span>
        </label>
        <label class="color-field">
          <input
            type="color"
            :value="props.style.activeColor"
            @input="update({ activeColor: ($event.target as HTMLInputElement).value })"
          />
          <span>Aktif</span>
        </label>
        <label class="color-field">
          <input
            type="color"
            :value="props.style.outlineColor"
            @input="update({ outlineColor: ($event.target as HTMLInputElement).value })"
          />
          <span>Outline</span>
        </label>
      </div>

      <label class="field" style="margin-top: 12px">
        <span>Tebal outline — {{ props.style.outlinePct.toFixed(0) }}% font</span>
        <input
          type="range"
          min="0"
          max="30"
          step="1"
          :value="props.style.outlinePct"
          @input="update({ outlinePct: numberFromEvent($event) })"
        />
      </label>
      <label class="field" style="margin-top: 8px">
        <span>Shadow — {{ props.style.shadowPct.toFixed(0) }}% font</span>
        <input
          type="range"
          min="0"
          max="20"
          step="1"
          :value="props.style.shadowPct"
          @input="update({ shadowPct: numberFromEvent($event) })"
        />
      </label>
    </section>

    <section class="style-section">
      <h3 class="panel-title">Teks</h3>
      <label class="switch-row">
        <input
          type="checkbox"
          :checked="props.style.uppercase"
          @change="update({ uppercase: ($event.target as HTMLInputElement).checked })"
        />
        <span>Huruf kapital semua</span>
      </label>
      <label class="switch-row">
        <input
          type="checkbox"
          :checked="props.style.hidePunctuation"
          @change="update({ hidePunctuation: ($event.target as HTMLInputElement).checked })"
        />
        <span>Sembunyikan tanda baca</span>
      </label>
    </section>

    <section class="style-section">
      <h3 class="panel-title">Pengelompokan</h3>
      <label class="field">
        <span>Maks kata per layar — {{ props.style.maxWordsPerGroup }}</span>
        <input
          type="range"
          min="1"
          max="8"
          step="1"
          :value="props.style.maxWordsPerGroup"
          @input="update({ maxWordsPerGroup: numberFromEvent($event) })"
        />
      </label>
      <label class="field" style="margin-top: 8px">
        <span>Jeda pemecah — {{ props.style.maxGapSec.toFixed(2) }} s</span>
        <input
          type="range"
          min="0.1"
          max="1.5"
          step="0.05"
          :value="props.style.maxGapSec"
          @input="update({ maxGapSec: numberFromEvent($event) })"
        />
      </label>
      <label class="field" style="margin-top: 8px">
        <span>Lebar maksimum — {{ props.style.maxWidthPct.toFixed(0) }}% video</span>
        <input
          type="range"
          min="40"
          max="100"
          step="1"
          :value="props.style.maxWidthPct"
          @input="update({ maxWidthPct: numberFromEvent($event) })"
        />
      </label>
    </section>

    <section class="style-section">
      <h3 class="panel-title">Animasi pop</h3>
      <label class="field">
        <span>Skala puncak — {{ props.style.popScalePct.toFixed(0) }}%</span>
        <input
          type="range"
          min="100"
          max="150"
          step="1"
          :value="props.style.popScalePct"
          @input="update({ popScalePct: numberFromEvent($event) })"
        />
      </label>
      <label class="field" style="margin-top: 8px">
        <span>Durasi pop — {{ props.style.popDurationMs }} ms</span>
        <input
          type="range"
          min="0"
          max="400"
          step="10"
          :value="props.style.popDurationMs"
          @input="update({ popDurationMs: numberFromEvent($event) })"
        />
      </label>
      <p class="muted" style="font-size: 12px; margin: 8px 0 0">
        100% = tanpa animasi (gaya karaoke).
      </p>
    </section>

    <section class="style-section">
      <h3 class="panel-title">Posisi</h3>
      <p class="muted" style="font-size: 12px; margin: 0 0 8px">
        Geser handle di preview, atau atur di sini. Disimpan dalam persen agar berlaku di semua
        rasio.
      </p>
      <label class="field">
        <span>Horizontal — {{ props.style.posXPct.toFixed(0) }}%</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="props.style.posXPct"
          @input="update({ posXPct: numberFromEvent($event) })"
        />
      </label>
      <label class="field" style="margin-top: 8px">
        <span>Vertikal — {{ props.style.posYPct.toFixed(0) }}%</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="props.style.posYPct"
          @input="update({ posYPct: numberFromEvent($event) })"
        />
      </label>
      <button class="btn btn-ghost btn-sm" style="width: 100%" @click="emit('reset-position')">
        Tengahkan horizontal (50%)
      </button>
    </section>

    <p v-if="props.saveError" class="banner banner-error" style="margin: 0 12px 12px">
      {{ props.saveError }}
    </p>
    <p v-else class="muted" style="font-size: 12px; padding: 0 12px 12px">
      {{ props.saving ? 'Menyimpan style…' : 'Style tersimpan otomatis.' }}
    </p>
  </div>
</template>
