<template>
  <button
    type="button"
    class="btn"
    :class="'btn-' + (copied ? 'success' : 'primary')"
    @click="copy"
  >
    <i v-if="copied" class="bi bi-clipboard-check-fill" aria-label="Copied"></i>
    <i v-else class="bi bi-clipboard" aria-label="Copy"></i>
  </button>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  data() {
    return {
      copied: false,
    }
  },
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  methods: {
    async copy() {
      await navigator.clipboard.writeText(this.value)

      this.copied = true

      setTimeout(() => {
        this.copied = false
      }, 1500)
    },
  },
})
</script>
