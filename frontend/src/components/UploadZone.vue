<template>
  <div
    :class="dragActive ? 'drag-active' : ''"
    @dragover.prevent="onDragover"
    @dragleave.prevent="onDragleave"
    @drop.prevent="onDrop"
  >
    <slot />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  data() {
    return {
      dragActive: false,
    }
  },
  emits: ['upload'],
  methods: {
    onDragover() {
      this.dragActive = true
    },
    onDragleave() {
      this.dragActive = false
    },
    onDrop(event: DragEvent) {
      if (event.dataTransfer) {
        this.$emit('upload', event.dataTransfer.files)
      }

      this.dragActive = false
    },
  },
})
</script>

<style scoped>
.drag-active {
  background-color: #d5eaff;
  border: dashed;
}
</style>
