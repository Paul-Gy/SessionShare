<script setup lang="ts">
import type { FilesIndex, LogEvent, UploadedFile } from '@/utils/api'

import axios from 'axios'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { decryptFromBase64, encryptAsBase64 } from '@/utils/crypto'
import { downloadBlob, hasFileIcon, formatBytes, readFile } from '@/utils/utils'
import CopyButton from '../components/CopyButton.vue'
import UploadZone from '../components/UploadZone.vue'

const emit = defineEmits(['error'])
const route = useRoute()
const router = useRouter()

const session = ref('')
const encryptionKey = ref('')
const username = ref('')
const usernameInput = ref('')
const loading = ref(false)
const rejoining = ref(false)
const webSocket = ref<WebSocket>()
const fileUpload = ref<HTMLElement>()
const users = reactive<string[]>([])
const logs = reactive<LogEvent[]>([])
const files = reactive<FilesIndex>({})

const currentURL = computed(() => window.location.href)

onMounted(() => {
  session.value = route.params.session as string
  encryptionKey.value = route.hash.substring(1)

  if (typeof route.query.user === 'string') {
    usernameInput.value = route.query.user

    join()
  }
})

function join() {
  handleError(null)
  loading.value = true

  const host = window.location.host
  const url = `wss://${host}/api/sessions/${session.value}/websocket`
  webSocket.value = new WebSocket(url)

  webSocket.value.addEventListener('open', () => {
    webSocket.value?.send(
      JSON.stringify({ ready: true, name: usernameInput.value }),
    )
    loading.value = false
    rejoining.value = false
  })

  webSocket.value.addEventListener('message', (event: MessageEvent) => {
    const data = JSON.parse(event.data)

    if (data.error) {
      handleError(data.error)
      return
    }

    if (data.ready === true) {
      loading.value = false
      username.value = usernameInput.value
      logs.length = 0
      users.length = 0
      logs.push(...data.logs.reverse())
      users.push(...data.users)

      Object.keys(files).forEach((key) => delete data[key])
      Object.keys(data.files).forEach((key) => (files[key] = data.files[key]))

      return
    }

    if (!username.value) {
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

  webSocket.value.addEventListener('close', (event: CloseEvent) => {
    console.log('WebSocket closed, reconnecting:', event.code, event.reason)
    rejoin()
  })

  webSocket.value.addEventListener('error', (event: Event) => {
    console.log('WebSocket error, reconnecting:', event)
    handleError('WebSocket error, trying to reconnect...')
    rejoin()
  })
}

async function rejoin() {
  if (rejoining.value) {
    return
  }

  rejoining.value = true
  webSocket.value = undefined

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
        'Session-Name': username.value,
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
      headers: {
        'Session-Name': username.value,
      },
    })
  } catch (e) {
    handleError(e)
  }

  loading.value = false
}

function closeSession() {
  if (webSocket.value) {
    webSocket.value.close()
  }

  router.push('/')
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
  <div v-if="username">
    <p class="text-center mb-2">
      Anyone with this link can access/upload/delete files from this session
      during 24 hours.
    </p>

    <div class="row justify-content-center mb-4">
      <div class="col-md-5 text-center">
        <div class="input-group">
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
          <div class="row text-center">
            <div v-for="user in users" :key="user" class="col-lg-2 col-md-3">
              <i class="bi bi-person-circle fs-1"></i>
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
                <div class="spinner-border" role="status"></div>
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
            <p v-for="log in logs" :key="log.type + log.date" class="mb-1">
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
        <form @submit.prevent="join" class="mb-3">
          <label class="form-label" for="username"
            >Enter a username to continue</label
          >
          <input
            v-model.trim="usernameInput"
            type="text"
            class="form-control mb-3"
            id="username"
            minlength="3"
            maxlength="16"
            required
          />

          <button
            type="submit"
            class="btn btn-primary rounded-pill"
            :disabled="loading"
          >
            <i class="bi bi-check-circle"></i> Go
            <span
              v-if="loading"
              class="spinner-border spinner-border-sm"
              role="status"
            />
          </button>
        </form>
      </div>
    </div>

    <hr />
  </div>
</template>
