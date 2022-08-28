<script setup lang="ts">
import CopyButton from '../components/CopyButton.vue'
import UploadZone from '../components/UploadZone.vue'
</script>

<template>
  <div v-if="username">
    <div class="row justify-content-center mb-4">
      <div class="col-md-6 text-center">
        <label class="form-label" for="session">
          Anyone with this link can access/upload/delete files from this session
          during 24 hours.
        </label>
        <div class="input-group">
          <input
            type="url"
            id="session"
            class="form-control"
            readonly
            :value="currentUrl()"
          />

          <CopyButton :value="currentUrl()" />
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
              <a v-else href="#" @click.prevent="openUploadPrompt">
                <i class="bi bi-file-earmark-plus fs-1"></i>
                <br />
                Upload
              </a>
            </div>
          </div>

          <div class="text-center small">
            <i class="bi bi-cloud-arrow-up"></i> Drag and drop to upload a file
          </div>

          <input
            @change="onUpload"
            type="file"
            id="fileUpload"
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
      <div class="col-md-6">
        <form @submit.prevent="join">
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
            class="btn btn-primary rounded-pill mb-3"
            :disabled="loading"
          >
            <i class="bi bi-check2-circle"></i> Go
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

<script lang="ts">
import type { FilesIndex, LogEvent, UploadedFile } from '@/utils/api'

import axios from 'axios'
import { defineComponent } from 'vue'
import {
  downloadBlob,
  filetypeIconExists,
  formatBytes,
  readFile,
} from '@/utils/utils'
import { decryptFromBase64, encryptAsBase64 } from '@/utils/crypto'

export default defineComponent({
  data() {
    return {
      session: '',
      encryptionKey: '',
      username: '',
      usernameInput: '',
      users: [] as string[],
      logs: [] as LogEvent[],
      files: {} as FilesIndex,
      webSocket: null as WebSocket | null,
      rejoining: false,
      loading: false,
      // startTime: Date.now(),
    }
  },
  emits: ['error'],
  mounted() {
    this.session = this.$route.params.session as string
    this.encryptionKey = this.$route.hash.substring(1)

    if (typeof this.$route.query.user === 'string') {
      this.usernameInput = this.$route.query.user

      this.join()
    }
  },
  methods: {
    join() {
      this.handleError(null)
      this.loading = true

      const host = window.location.host
      const url = `wss://${host}/api/sessions/${this.session}/websocket`
      this.webSocket = new WebSocket(url)

      this.webSocket.addEventListener('open', () => {
        this.webSocket?.send(
          JSON.stringify({ ready: true, name: this.usernameInput }),
        )
        this.loading = false
        this.rejoining = false
      })

      this.webSocket.addEventListener('message', (event: MessageEvent) => {
        const data = JSON.parse(event.data)

        if (data.error) {
          this.handleError(data.error)
          return
        }

        if (data.ready === true) {
          this.loading = false
          this.username = this.usernameInput
          this.files = data.files
          this.logs = data.logs.reverse()
          this.users = data.users
          return
        }

        if (!this.username) {
          return // Not ready yet
        }

        if (!data.type) {
          this.handleError('Unknown response: ' + event.data)
          return
        }

        this.logs.unshift(data)

        while (this.logs.length > 15) {
          this.logs.pop()
        }

        switch (data.type) {
          case 'user_join':
            if (!this.users.includes(data.user)) {
              this.users.push(data.user)
            }
            break
          case 'user_leave':
            this.users = this.users.filter((u) => u !== data.user)
            break
          case 'file_upload':
            this.files[data.file.id] = data.file
            break
          case 'file_delete':
            delete this.files[data.file.id]
            break
          case 'close':
            this.closeSession()
            break
        }
      })

      this.webSocket.addEventListener('close', (event: CloseEvent) => {
        console.log('WebSocket closed, reconnecting:', event.code, event.reason)
        this.rejoin()
      })
      this.webSocket.addEventListener('error', (event: Event) => {
        console.log('WebSocket error, reconnecting:', event)
        this.handleError('WebSocket error, trying to reconnect...')
        this.rejoin()
      })
    },
    async rejoin() {
      if (this.rejoining) {
        return
      }

      this.rejoining = true
      this.webSocket = null

      /*let timeSinceLastJoin = Date.now() - startTime
      if (timeSinceLastJoin < 10000) {
          // Less than 10 seconds elapsed since last join. Pause a bit.
          await new Promise(resolve => setTimeout(resolve, 10000 - timeSinceLastJoin))
      }*/
      this.join()
    },
    async downloadFile(file: UploadedFile) {
      if (file.encrypted && !this.encryptionKey) {
        this.handleError(
          'This file is encrypted but no encryption key is present in the URL.',
        )
        return
      }

      this.loading = true

      try {
        const response = await axios.get(
          this.fileUrl(file.id),
          file.encrypted ? {} : { responseType: 'blob' },
        )
        const blob = file.encrypted
          ? await decryptFromBase64(response.data, this.encryptionKey)
          : response.data

        downloadBlob(blob, file.id, file.type ?? 'application/download')
      } catch (e) {
        this.handleError(e)
      }

      this.loading = false
    },
    async uploadFile(files: FileList) {
      const file = files[0]

      if (
        this.files[file.name] &&
        !confirm('A file with this name already exists, replace it?')
      ) {
        return
      }

      if (file.size > 100 * 1024 * 1024) {
        this.handleError('Max upload size is 100 MB.')
        return
      }

      if (Object.keys(this.files).length > 25) {
        this.handleError('A session can contains up to 25 files.')
        return
      }

      if (this.loading) {
        return
      }

      try {
        this.loading = true

        const body = this.encryptionKey
          ? await encryptAsBase64(await readFile(file), this.encryptionKey)
          : file

        await axios.post(this.fileUrl(file.name), body, {
          headers: {
            'Content-Type': file.type,
            'Session-Name': this.username,
            'X-Encrypted': !!this.encryptionKey,
          },
        })
      } catch (e) {
        this.handleError(e)
      }

      this.loading = false
    },
    async deleteFile(fileId: string) {
      if (!confirm('Are you sure you want to delete ' + fileId + ' ?')) {
        return
      }

      this.loading = true

      try {
        await axios.delete(this.fileUrl(fileId), {
          headers: {
            'Session-Name': this.username,
          },
        })
      } catch (e) {
        this.handleError(e)
      }

      this.loading = false
    },
    closeSession() {
      if (this.webSocket) {
        this.webSocket.close()
      }

      this.$router.push('/')
    },
    openUploadPrompt() {
      document.getElementById('fileUpload')?.click()
    },
    async onUpload(event: Event) {
      if (event.target instanceof HTMLInputElement && event.target.files) {
        await this.uploadFile(event.target.files)
      }
    },
    handleError(error: unknown) {
      this.$emit('error', error)
    },
    formatLogEvent(event: LogEvent) {
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
    },
    fileUrl(file: string) {
      return `/api/sessions/${this.session}/files/${file}`
    },
    formatBytes,
    fileIcon(filename: string) {
      const extension = filename.toLowerCase().split('.').pop()

      return extension && filetypeIconExists(extension)
        ? 'bi-filetype-' + extension
        : 'bi-file-earmark'
    },
    currentUrl() {
      return window.location.href
    },
  },
})
</script>
