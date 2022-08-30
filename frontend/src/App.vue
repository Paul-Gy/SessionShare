<script setup lang="ts">
import { ref } from 'vue'
import { RouterView } from 'vue-router'

const lastError = ref<string>()

function handleError(e: Event | null) {
  lastError.value = e?.toString() ?? ''
}
</script>

<template>
  <div class="container my-5">
    <h1 class="text-center">SessionShare</h1>
    <p class="text-center mb-4">
      Easily share files in multiple times with a single link!
    </p>

    <div
      v-if="lastError"
      class="alert alert-danger alert-dismissible fade show"
      role="alert"
    >
      <i class="bi bi-exclamation-circle"></i> {{ lastError }}
      <button
        @click="handleError(null)"
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
