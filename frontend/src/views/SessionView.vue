<script setup lang="ts">
import type { FilesIndex, LogEvent, UploadedFile } from '@/utils/api'

import axios from 'axios'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { decryptFromBase64, encryptAsBase64 } from '@/utils/crypto'
import {
  downloadBlob,
  hasFileIcon,
  formatBytes,
  readFile,
  randomName,
} from '@/utils/utils'
import CopyButton from '@/components/CopyButton.vue'
import QrModal from '@/components/QrModal.vue'
import UploadZone from '@/components/UploadZone.vue'

const emit = defineEmits<{ (e: 'error', error: unknown): void }>()
const route = useRoute()
const router = useRouter()

const session = ref('')
const encryptionKey = ref('')
const ready = ref(false)
const loading = ref(false)
const showQrModal = ref(false)
const fileUpload = ref<HTMLElement>()
const users = reactive<string[]>([])
const logs = reactive<LogEvent[]>([])
const files = reactive<FilesIndex>({})

const currentURL = computed(() => window.location.href)

const username = randomName()

let rejoining = false
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

async function downloadFile(file: UploadedFile) {
  if (file.encrypted && !encryptionKey.value) {
    handleError(
      'This file is encrypted but no encryption key is present in the URL.',
    )
    return
  }

  loading.value = true

  try {
    const response = await axios.get(
      fileUrl(file.id),
      file.encrypted ? {} : { responseType: 'blob' },
    )
    const blob = file.encrypted
      ? await decryptFromBase64(response.data, encryptionKey.value)
      : response.data

    downloadBlob(blob, file.id, file.type ?? 'application/download')
  } catch (e) {
    handleError(e)
  }

  loading.value = false
}

async function uploadFile(fileList: FileList) {
  const file = fileList[0]

  if (
    files[file.name] &&
    !confirm('A file with this name already exists, replace it?')
  ) {
    return
  }

  if (file.size > 100 * 1024 * 1024) {
    handleError('Max upload size is 100 MB.')
    return
  }

  if (Object.keys(files).length > 25) {
    handleError('A session can contains up to 25 files.')
    return
  }

  if (loading.value) {
    return
  }

  try {
    loading.value = true

    const body = encryptionKey.value
      ? await encryptAsBase64(await readFile(file), encryptionKey.value)
      : file

    await axios.post(fileUrl(file.name), body, {
      headers: {
        'Content-Type': file.type,
        'Session-Name': username,
        'X-Encrypted': !!encryptionKey.value,
      },
    })
  } catch (e) {
    handleError(e)
  }

  loading.value = false
}

async function deleteFile(fileId: string) {
  if (!confirm('Are you sure you want to delete ' + fileId + ' ?')) {
    return
  }

  loading.value = true

  try {
    await axios.delete(fileUrl(fileId), {
      headers: { 'Session-Name': username },
    })
  } catch (e) {
    handleError(e)
  }

  loading.value = false
}

function closeSession() {
  if (webSocket) {
    webSocket.close()
  }

  router.push('/')
}

function toggleQrModal() {
  showQrModal.value = !showQrModal.value

  if (showQrModal.value) {
    document.body.classList.add('overflow-hidden')
  } else {
    document.body.classList.remove('overflow-hidden')
  }
}

function handleError(error: unknown) {
  return emit('error', error)
}

async function onUpload(event: Event) {
  if (event.target instanceof HTMLInputElement && event.target.files) {
    await uploadFile(event.target.files)
  }
}

function formatLogEvent(event: LogEvent) {
  switch (event.type) {
    case 'user_join':
      return `${event.user} joined the session`
    case 'user_leave':
      return `${event.user} left the session`
    case 'file_upload':
      return `${event.user} uploaded a file: ${event.file?.name}`
    case 'file_delete':
      return `${event.user} deleted a file: ${event.file?.name}`
  }
}

function fileIcon(filename: string) {
  const extension = filename.toLowerCase().split('.').pop()

  return extension && hasFileIcon(extension)
    ? 'bi-filetype-' + extension
    : 'bi-file-earmark'
}

function fileUrl(file: string) {
  return `/api/sessions/${session.value}/files/${file}`
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
        <div class="input-group">
          <button
            @click="toggleQrModal"
            type="button"
            class="btn btn-secondary"
            title="QR Code"
          >
            <i class="bi bi-qr-code" />
          </button>

          <input
            type="url"
            id="session"
            class="form-control"
            readonly
            :value="currentURL"
          />

          <CopyButton :value="currentURL" />
        </div>

        <span v-if="encryptionKey" class="form-text text-success">
          <i class="bi bi-shield-shaded"></i> Files in this session are
          end-to-end encrypted.
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

        <UploadZone class="content-box" @upload="uploadFile">
          <h2>Files</h2>
          <div class="row gy-3 text-center mb-2">
            <div v-for="file in files" :key="file.id" class="col-lg-2 col-md-3">
              <a
                v-if="file.encrypted"
                @click.prevent="downloadFile(file)"
                href="#"
              >
                <i class="bi fs-1" :class="fileIcon(file.name)"></i>
                <br />
                {{ file.name }}
              </a>

              <a v-else :href="fileUrl(file.id)" :download="file.name">
                <i class="bi fs-1" :class="fileIcon(file.name)"></i>
                <br />
                {{ file.name }}
              </a>

              <br />

              <small class="d-block">{{ formatBytes(file.size) }}</small>

              <button
                :disabled="loading"
                type="button"
                @click="deleteFile(file.id)"
                class="btn btn-danger btn-small mt-2"
              >
                <i class="bi bi-trash" aria-label="Delete"></i>
              </button>
            </div>

            <div class="col-lg-2 col-md-3">
              <div v-if="loading">
                <div class="spinner-border" role="status" />
                <br />
                Loading...
              </div>
              <a v-else href="#" @click.prevent="fileUpload?.click()">
                <i class="bi bi-file-earmark-plus fs-1"></i>
                <br />
                Upload
              </a>
            </div>
          </div>

          <div class="text-center small">
            <i class="bi bi-cloud-arrow-up-fill"></i>
            Drag and drop to upload a file
          </div>

          <input
            @change="onUpload"
            type="file"
            ref="fileUpload"
            class="d-none"
          />
        </UploadZone>
      </div>

      <div class="col-md-4">
        <div class="content-box h-100">
          <h2>Session history</h2>

          <div class="overflow-scroll">
            <p
              v-for="log in logs"
              :key="log.type + log.date"
              :title="log.date.toString()"
              class="mb-1"
            >
              <i class="bi bi-chevron-double-right"></i>
              {{ formatLogEvent(log) }}
            </p>
          </div>
        </div>
      </div>
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

  <QrModal @close="toggleQrModal" :show="showQrModal" :value="currentURL" />
</template>
