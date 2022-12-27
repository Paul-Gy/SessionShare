<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ (e: 'upload', files: FileList): void }>()

const dragActive = ref(false)

function setDragActive(active: boolean) {
  dragActive.value = active
}

function onDrop(event: DragEvent) {
  if (event.dataTransfer) {
    emit('upload', event.dataTransfer.files)
  }

  setDragActive(false)
}
</script>

<template>
  <div
    :class="dragActive ? 'border border-primary' : ''"
    @dragover.prevent="setDragActive(true)"
    @dragleave.prevent="setDragActive(false)"
    @drop.prevent="onDrop"
  >
    <slot />
  </div>
</template>
