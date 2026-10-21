<script setup lang="ts">
import type { CaptionGroup, Word } from '@acs/shared'

const props = defineProps<{
  groups: CaptionGroup[]
  currentTime: number
  activeGroupIndex: number
  activeWordId: string | null
  selectedWordId: string | null
}>()

const emit = defineEmits<{
  seek: [number]
  select: [string]
  rename: [string, string]
  join: [string]
  split: [string]
  remove: [string]
}>()

const editingId = ref<string | null>(null)
const draft = ref('')
const editInput = ref<HTMLInputElement | null>(null)

function bindEditInput(el: unknown, wordId: string) {
  if (wordId === editingId.value) editInput.value = el as HTMLInputElement | null
}

function isActiveGroup(index: number): boolean {
  return index === props.activeGroupIndex
}

function selectWord(word: Word) {
  emit('select', word.id)
  emit('seek', word.start)
}

async function startEdit(word: Word) {
  editingId.value = word.id
  draft.value = word.text
  emit('select', word.id)
  await nextTick()
  editInput.value?.focus()
  editInput.value?.select()
}

function commitEdit() {
  if (!editingId.value) return
  const id = editingId.value
  const text = draft.value.trim()
  editingId.value = null
  if (text) emit('rename', id, text)
}

function cancelEdit() {
  editingId.value = null
}

function onEditKey(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    commitEdit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
  }
}
</script>

<template>
  <div class="caption-groups">
    <div
      v-for="(group, index) in props.groups"
      :key="group.words[0]?.id ?? index"
      class="caption-group"
      :class="{ 'caption-group-active': isActiveGroup(index) }"
    >
      <button class="group-time mono" :title="`Loncat ke ${group.start.toFixed(2)}s`" @click="emit('seek', group.start)">
        {{ formatDuration(group.start) }}
      </button>
      <div class="group-words">
        <span
          v-for="word in group.words"
          :key="word.id"
          class="caption-word"
          :class="{
            'caption-word-active': word.id === props.activeWordId,
            'caption-word-selected': word.id === props.selectedWordId,
            'caption-word-editing': editingId === word.id,
          }"
          @click="selectWord(word)"
          @dblclick.stop="startEdit(word)"
        >
          <input
            v-if="editingId === word.id"
            :ref="(el) => bindEditInput(el, word.id)"
            v-model="draft"
            class="word-inline-input"
            @blur="commitEdit"
            @keydown="onEditKey"
            @click.stop
            @dblclick.stop
          />
          <template v-else>{{ word.text }}</template>
        </span>
      </div>
    </div>

    <p v-if="props.groups.length === 0" class="muted">
      Belum ada caption. Mulai transkripsi untuk membuatnya.
    </p>
  </div>
</template>
