<script setup lang="ts">
import { BIconShare } from 'bootstrap-icons-vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import wretch from 'wretch'

const router = useRouter()
const emit = defineEmits<{ error: [error: unknown] }>()

const loading = ref(false)
const encrypted = ref(false)

async function start() {
  try {
    loading.value = true

    const key = encrypted.value ? '#' + (Math.random() + 1).toString(36).substring(2) : ''
    const response = await wretch('/api/sessions').post().json<{ session: string }>()
    const session = response.session

    await router.push(`/${session}${key}`)
  } catch (e) {
    emit('error', e)
  }

  loading.value = false
}
</script>

<template>
  <main class="text-center">
    <button @click="start" type="button" class="btn btn-primary rounded-pill mb-3">
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
          Enable end-to-end files encryption (link will be longer)
        </label>
      </div>
    </div>

    <p class="mb-5 small">If you already have a link you can directly open it!</p>

    <h2>Why this website ?</h2>

    <p class="mb-5">
      When working with several people, it is often necessary to send files to each other. There are
      many services to send a single file, but I haven't found one that allows you to send several
      files in several times without having to send a new link each time.
    </p>

    <hr />
  </main>
</template>
