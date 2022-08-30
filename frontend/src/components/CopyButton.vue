<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps({
  value: { type: String, required: true },
})

const copied = ref(false)

async function copy() {
  await navigator.clipboard.writeText(props.value)

  copied.value = true

  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <button type="button" class="btn btn-primary" @click="copy">
    <i v-if="copied" class="bi bi-check-lg" aria-label="Copied"></i>
    <i v-else class="bi bi-clipboard" aria-label="Copy"></i>
  </button>
</template>
