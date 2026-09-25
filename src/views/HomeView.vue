<script setup lang="ts">
import { BIconShare } from 'bootstrap-icons-vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { http } from '@/utils/api'
import { randomString } from '@/utils/crypto'

const router = useRouter()
const emit = defineEmits<{ error: [error: unknown] }>()

const loading = ref(false)
const encrypted = ref(false)

async function start() {
  if (loading.value) {
    return
  }

  try {
    loading.value = true

    const hash = encrypted.value ? `#${randomString(12)}` : ''
    const response = await http.post<unknown, { session: string }>('/api/sessions', {
      encrypted: encrypted.value,
    })
    const session = response.session

    await router.push({ path: `/${session}`, hash })
  } catch (e) {
    emit('error', e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="text-center">
    <button
      @click="start"
      :disabled="loading"
      type="button"
      class="btn btn-primary rounded-pill mb-3"
    >
      <BIconShare /> Start a new sharing session
    </button>

    <div class="d-flex justify-content-center">
      <div class="form-check form-switch mb-2">
        <input
          class="form-check-input flex-shrink-0"
          type="checkbox"
          id="encryptionSwitch"
          v-model="encrypted"
        />
        <label class="form-check-label" for="encryptionSwitch">
          Enable end-to-end file encryption (link will be longer)
        </label>
      </div>
    </div>

    <p class="mb-5 small">If you already have a link, you can open it directly!</p>

    <h2>Why this website?</h2>

    <p class="mb-5">
      When working with several people, it is often necessary to send files to each other. There are
      many services for sending a single file, but I haven't found one that lets you send several
      files at different times without having to share a new link each time.
    </p>

    <hr />
  </main>
</template>
