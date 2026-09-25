<script setup lang="ts">
import type { FilesIndex, LogEvent, UploadedFile } from '@/utils/api'

import { BIconShieldShaded } from 'bootstrap-icons-vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SessionActivity from '@/components/SessionActivity.vue'
import SessionFiles from '@/components/SessionFiles.vue'
import ShareInput from '@/components/ShareInput.vue'
import { maxLogEntries } from '@/utils/api'

const emit = defineEmits<{ error: [error: unknown] }>()
const route = useRoute()
const router = useRouter()

const username = ref<string>()
const clientId = ref<string>()
const encryptionKey = ref<string>()
const loading = ref(false)
const users = reactive<string[]>([])
const logs = reactive<LogEvent[]>([])
const files = reactive<FilesIndex>(Object.create(null))
const reconnectAttempts = ref(0)

const session = computed(() => route.params.session as string)
const currentURL = computed(() => new URL(route.fullPath, window.location.origin).href)

let closed = false
let rejoinTimeout: number | undefined
let bucketDomain: string | undefined
let webSocket: WebSocket | undefined

onMounted(() => {
  // Read once on mount as hash-only URL changes don't remount (keyed by session) and are deliberately ignored
  encryptionKey.value = route.hash.substring(1)

  join()
})

onBeforeUnmount(() => closeSession(false))

function handleWebSocketMessage(event: MessageEvent) {
  const data = JSON.parse(event.data)

  if (data.error) {
    handleError(data.error)

    if (data.close) {
      closeSession(true)
    }

    return
  }

  if (data.ready === true) {
    if (!data.encrypted && encryptionKey.value) {
      encryptionKey.value = undefined
      router.replace({ hash: '' })
    }

    handleError(null) // Connected: clear any previous connection error

    const newLogs = data.logs.map((log: LogEvent) => ({ ...log, date: new Date(log.date) }))

    loading.value = false
    reconnectAttempts.value = 0
    username.value = data.name
    clientId.value = data.id
    bucketDomain = data.bucketDomain
    logs.splice(0, logs.length, ...newLogs.toReversed())
    users.splice(0, users.length, ...data.users)

    for (const key of Object.keys(files)) {
      delete files[key]
    }

    for (const [key, file] of Object.entries<UploadedFile>(data.files)) {
      files[key] = { ...file, updatedAt: new Date(file.updatedAt) }
    }

    return
  }

  if (!username.value) {
    return // Not ready yet
  }

  if (!data.type || !data.date) {
    handleError(`Unexpected websocket message: ${event.data}`)
    return
  }

  handleLogEvent({ ...data, date: new Date(data.date) })
}

function handleLogEvent(log: LogEvent) {
  logs.unshift(log)
  logs.splice(maxLogEntries)

  switch (log.type) {
    case 'user_join':
      if (!users.includes(log.user)) {
        users.push(log.user)
      }
      break
    case 'user_leave': {
      const index = users.indexOf(log.user)
      if (index >= 0) {
        users.splice(index, 1)
      }
      break
    }
    case 'file_upload':
      files[log.file.id] = { ...log.file, updatedAt: new Date(log.file.updatedAt) }
      break
    case 'file_delete':
      delete files[log.file.id]
      break
    case 'close':
      closeSession()
      break
    default:
      break
  }
}

async function join() {
  if (closed) {
    return
  }

  loading.value = true

  const host = window.location.host
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'

  if (reconnectAttempts.value > 0) {
    // Check only on reconnect to avoid unnecessary requests on normal path (and 500ms is acceptable)
    // A dead session returns 404, so stop retrying to reconnect
    const response = await fetch(`/api/sessions/${session.value}/status`).catch(() => undefined)

    if (closed) {
      return // ignore if closed during status request
    }

    if (response?.status === 404) {
      handleError('This session does not exist anymore.')
      closeSession(false)
      return
    }
  }

  const socket = new WebSocket(`${protocol}://${host}/api/sessions/${session.value}/websocket`)
  webSocket = socket

  socket.addEventListener('open', () => {
    const hasKey = Boolean(encryptionKey.value)
    socket.send(JSON.stringify({ action: 'join', clientId: clientId.value, hasKey }))
  })

  socket.addEventListener('message', (event: MessageEvent) => {
    try {
      handleWebSocketMessage(event)
    } catch (e) {
      handleError(e)
    }
  })

  socket.addEventListener('close', (event: CloseEvent) => {
    console.warn('WebSocket closed, reconnecting:', event.code, event.reason)
    rejoin(socket)
  })

  socket.addEventListener('error', (event: Event) => {
    console.warn('WebSocket error, reconnecting:', event)
    handleError('WebSocket error, trying to reconnect...')
    rejoin(socket)
  })
}

function rejoin(socket: WebSocket) {
  // Ignore events from a socket that was already replaced or closed.
  if (closed || webSocket !== socket) {
    return
  }

  webSocket = undefined

  // 500ms, 1s, 2s, 4s ... capped at 180s (and small jitter)
  const delay = Math.min(500 * 2 ** reconnectAttempts.value, 180_000) + Math.random() * 250
  reconnectAttempts.value++

  rejoinTimeout = setTimeout(join, delay)
}

function closeSession(redirect = true) {
  closed = true

  clearTimeout(rejoinTimeout)
  rejoinTimeout = undefined

  webSocket?.close()
  webSocket = undefined

  if (redirect) {
    router.push('/')
  }
}

function sendChatMessage(message: string, messageId: number) {
  if (webSocket?.readyState === WebSocket.OPEN) {
    webSocket.send(JSON.stringify({ action: 'message', message, messageId }))
  }
}

function userAvatar(user: string): string {
  // Simple split, as usernames come from the backend, always with format "<adjective> <animal>"
  return `/avatars/${user.toLowerCase().split(' ')[1]}.svg`
}

function handleError(error: unknown): void {
  emit('error', error)
}

function setLoading(value: boolean): void {
  loading.value = value
}
</script>

<template>
  <div v-if="clientId && username">
    <p class="text-center mb-2">
      Anyone with this link can access/upload/delete files from this session for 24 hours after the
      last activity.
    </p>

    <div class="row justify-content-center mb-4">
      <div class="col-xl-5 col-lg-6 col-md-8 text-center">
        <ShareInput :value="currentURL" />

        <span v-if="encryptionKey" class="form-text text-success">
          <BIconShieldShaded /> Files in this session are end-to-end encrypted.
        </span>
      </div>
    </div>

    <div class="row g-4 gy-3 mb-4">
      <div class="col-lg-8">
        <div class="content-box mb-4">
          <h2>Online users</h2>
          <div class="row gy-3 text-center">
            <div v-for="user in users" :key="user" class="col-lg-2 col-md-3">
              <img :src="userAvatar(user)" :alt="user" height="60" class="mb-1" />
              <br />
              {{ user }}
              <div v-if="user === username" class="fw-bold">(You)</div>
            </div>
          </div>
        </div>

        <SessionFiles
          :bucket-domain="bucketDomain"
          :session="session"
          :files="files"
          :encryption-key="encryptionKey"
          :loading="loading"
          :client-id="clientId"
          @loading="setLoading"
          @error="handleError"
          @reconnect="webSocket?.close()"
        />
      </div>

      <SessionActivity
        @message="sendChatMessage"
        :logs="logs"
        :user="username"
        :rejoining="reconnectAttempts > 0"
      />
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
