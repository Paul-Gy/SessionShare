<script setup lang="ts">
import { BIconExclamationCircle, BIconHeart } from 'bootstrap-icons-vue'
import { ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'

const route = useRoute()

const lastError = ref<string>()

watch(
  () => route.path,
  () => (lastError.value = undefined),
)

function handleError(error: unknown) {
  if (!error) {
    lastError.value = undefined
    return
  }

  console.error(error)

  if (error instanceof Error) {
    lastError.value = error.message
    return
  }

  lastError.value =
    error && typeof error === 'object' && 'error' in error && 'status' in error
      ? `${error.error} (${error.status})`
      : String(error)
}
</script>

<template>
  <div class="container my-5">
    <h1 class="text-center">
      <RouterLink to="/" class="link-body-emphasis"> SessionShare </RouterLink>
    </h1>
    <p class="text-center mb-4">Easily share files multiple times with a single link.</p>

    <div v-if="lastError" class="alert alert-danger alert-dismissible fade show" role="alert">
      <BIconExclamationCircle /> {{ lastError }}
      <button @click="handleError(null)" type="button" class="btn-close" aria-label="Close" />
    </div>

    <RouterView @error="handleError" :key="route.params.session?.toString() ?? ''" />

    <p class="text-center">
      Open source on
      <a href="https://github.com/Paul-Gy/SessionShare" target="_blank" rel="noopener noreferrer"
        >GitHub</a
      >
      - Built with <BIconHeart class="text-danger" /> in Switzerland on
      <a href="https://workers.cloudflare.com/" target="_blank" rel="noopener noreferrer"
        >Cloudflare Workers</a
      >
      with
      <a href="https://vuejs.org/" target="_blank" rel="noopener noreferrer">Vue.js</a>
    </p>
  </div>
</template>
