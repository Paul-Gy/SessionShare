<script setup lang="ts">
import type { FilesIndex, LogEvent } from '@/utils/api'

import { BIconShieldShaded } from 'bootstrap-icons-vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SessionFiles from '@/components/SessionFiles.vue'
import SessionHistory from '@/components/SessionHistory.vue'
import ShareInput from '@/components/ShareInput.vue'
import { randomName } from '@/utils/utils'

const emit = defineEmits<{ (e: 'error', error: unknown): void }>()
const route = useRoute()
const router = useRouter()

const session = ref('')
const encryptionKey = ref('')
const ready = ref(false)
const loading = ref(false)
const users = reactive<string[]>([])
const logs = reactive<LogEvent[]>([])
const files = reactive<FilesIndex>({})

const currentURL = computed(() => window.location.href)

const username = randomName()

let rejoining = false
let bucketDomain: string | undefined
let webSocket: WebSocket | undefined

onMounted(() => {
  session.value = route.params.session as string
  encryptionKey.value = route.hash.substring(1)

  join()
})

function join() {
  handleError(null)
  loading.value = true

  const host = window.location.host
  const url = `wss://${host}/api/sessions/${session.value}/websocket`
  webSocket = new WebSocket(url)

  webSocket.addEventListener('open', () => {
    webSocket?.send(JSON.stringify({ ready: true, name: username }))
    loading.value = false
    rejoining = false
  })

  webSocket.addEventListener('message', (event: MessageEvent) => {
    const data = JSON.parse(event.data)

    if (data.error) {
      handleError(data.error)
      return
    }

    if (data.ready === true) {
      loading.value = false
      ready.value = true
      bucketDomain = data.bucketDomain
      logs.splice(0)
      users.splice(0)
      logs.push(...data.logs.reverse())
      users.push(...data.users)

      Object.keys(files).forEach((key) => delete data[key])
      Object.keys(data.files).forEach((key) => (files[key] = data.files[key]))

      return
    }

    if (!ready.value) {
      return // Not ready yet
    }

    if (!data.type) {
      handleError('Unknown response: ' + event.data)
      return
    }

    logs.unshift(data)

    while (logs.length > 15) {
      logs.pop()
    }

    switch (data.type) {
      case 'user_join':
        if (!users.includes(data.user)) {
          users.push(data.user)
        }
        break
      case 'user_leave':
        while (users.includes(data.user)) {
          users.splice(users.indexOf(data.user), 1)
        }
        break
      case 'file_upload':
        files[data.file.id] = data.file
        break
      case 'file_delete':
        delete files[data.file.id]
        break
      case 'close':
        closeSession()
        break
    }
  })

  webSocket.addEventListener('close', (event: CloseEvent) => {
    console.log('WebSocket closed, reconnecting:', event.code, event.reason)
    rejoin()
  })

  webSocket.addEventListener('error', (event: Event) => {
    console.log('WebSocket error, reconnecting:', event)
    handleError('WebSocket error, trying to reconnect...')
    rejoin()
  })
}

async function rejoin() {
  if (rejoining) {
    return
  }

  rejoining = true
  webSocket = undefined

  join()
}

function closeSession() {
  if (webSocket) {
    webSocket.close()
  }

  router.push('/')
}

function handleError(error: unknown) {
  return emit('error', error)
}

function setLoading(value: boolean) {
  loading.value = value
}
</script>

<template>
  <div v-if="ready">
    <p class="text-center mb-2">
      Anyone with this link can access/upload/delete files from this session
      during 24 hours.
    </p>

    <div class="row justify-content-center mb-4">
      <div class="col-md-5 text-center">
        <ShareInput :value="currentURL" />

        <span v-if="encryptionKey" class="form-text text-success">
          <BIconShieldShaded /> Files in this session are end-to-end encrypted.
        </span>
      </div>
    </div>

    <div class="row g-4 gy-3 mb-4">
      <div class="col-md-8">
        <div class="content-box mb-4">
          <h2>Online users</h2>
          <div class="row gy-3 text-center">
            <div v-for="user in users" :key="user" class="col-lg-2 col-md-3">
              <img
                :src="`/avatars/${user.toLowerCase().split(' ')[1]}.svg`"
                :alt="user"
                height="60"
                class="mb-1"
              />
              <br />
              {{ user }}
            </div>
          </div>
        </div>

        <SessionFiles
          :bucket-domain="bucketDomain"
          :session="session"
          :files="files"
          :encryption-key="encryptionKey"
          :loading="loading"
          :user="username"
          @loading="setLoading"
          @error="handleError"
        />
      </div>

      <SessionHistory :logs="logs" />
    </div>
  </div>

  <div v-else class="text-center">
    <div class="row justify-content-center">
      <div class="col-md-5">
        <div class="spinner-border mb-3" />

        <h2>Loading...</h2>
      </div>
    </div>

    <hr />
  </div>
</template>
