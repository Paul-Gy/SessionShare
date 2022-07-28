<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="container my-5">
    <h1 class="text-center">SessionShare</h1>
    <p class="text-center mb-4">
      Easily share files in multiple times with a single link!
    </p>

    <div
      v-if="lastError"
      class="alert alert-danger alert-dismissible fade show mb-3"
      role="alert"
    >
      <i class="bi bi-exclamation-circle"></i> {{ lastError }}
      <button
        @click="closeError"
        type="button"
        class="btn-close"
        aria-label="Close"
      ></button>
    </div>

    <RouterView @error="handleError" />

    <p class="text-center">
      Open source on
      <a
        href="https://github.com/Paul-Gy/SessionShare"
        target="_blank"
        ref="nofollow"
        >GitHub</a
      >
      - Built with <i class="bi-heart text-danger" role="img"></i> in
      Switzerland on
      <a href="https://workers.cloudflare.com/" target="_blank" rel="nofollow"
        >Cloudflare Workers</a
      >
      with
      <a href="https://vuejs.org/" target="_blank" rel="nofollow">Vue.js</a>
    </p>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  data() {
    return {
      lastError: '',
    }
  },
  methods: {
    handleError(e: Event | null) {
      this.lastError = e?.toString() ?? ''
    },
    closeError() {
      this.lastError = ''
    },
  },
})
</script>
