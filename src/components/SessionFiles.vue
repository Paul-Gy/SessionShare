<script setup lang="ts">
import type { FilesIndex, UploadedFile } from '@/utils/api'

import { BIconCloudArrowUpFill, BIconFileEarmarkPlus, BIconTrash } from 'bootstrap-icons-vue'
import { ref, useTemplateRef } from 'vue'

import FileIcon from '@/components/FileIcon.vue'
import { http, maxUploadSize, maxSessionFiles, slugifyFile } from '@/utils/api'
import { decrypt, encrypt } from '@/utils/crypto'
import { downloadBlob, formatBytes } from '@/utils/utils'

const props = defineProps<{
  bucketDomain?: string
  encryptionKey?: string
  loading: boolean
  clientId: string
  session: string
  files: FilesIndex
}>()
const emit = defineEmits<{
  loading: [value: boolean]
  error: [error: unknown]
  reconnect: []
}>()

const fileUpload = useTemplateRef('fileUpload')
const dropZone = useTemplateRef('dropZone')
const dragActive = ref(false)

function fileApiUrl(file: string) {
  return `/api/sessions/${props.session}/files/${file}`
}

function fileUploadUrl(file: string) {
  // Encoding is required for POST as raw name is used instead of ID
  return fileApiUrl(encodeURIComponent(file))
}

function fileDownloadUrl(file: UploadedFile) {
  const version = `?v=${file.updatedAt.getTime()}`

  return props.bucketDomain
    ? `https://${props.bucketDomain}/${file.storageKey}${version}`
    : fileApiUrl(file.id) + version
}

async function downloadFile(file: UploadedFile) {
  emit('loading', true)

  try {
    const body = await http.get(fileDownloadUrl(file), {
      parse: props.encryptionKey ? 'arrayBuffer' : 'blob',
    })
    const data = props.encryptionKey ? await decrypt(body, props.encryptionKey) : body

    downloadBlob(data, file.name, file.type ?? 'application/octet-stream')
  } catch (e) {
    emit('error', e)
  } finally {
    emit('loading', false)
  }
}

async function uploadFile(file: File) {
  if (file.name.length > 100) {
    emit('error', 'A file name must be at most 100 characters.')
    return
  }

  if (file.size > maxUploadSize) {
    const maxUploadFormatted = formatBytes(maxUploadSize)
    emit('error', `The file "${file.name}" is too large, max upload size is ${maxUploadFormatted}.`)
    return
  }

  try {
    const body = props.encryptionKey ? await encrypt(file, props.encryptionKey) : file

    await http.post(fileUploadUrl(file.name), body, {
      encode: false,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'Session-Client-Id': props.clientId,
      },
    })
  } catch (e) {
    handleRequestError(e)
  }
}

async function uploadFiles(files: FileList) {
  if (props.loading || files.length === 0) {
    return
  }

  const uploadFileIds = Array.from(files, (file) => slugifyFile(file.name))

  if (new Set(uploadFileIds).size !== uploadFileIds.length) {
    emit('error', 'Selected files contain duplicate file names.')
    return
  }

  const fileIds = new Set([...Object.keys(props.files), ...uploadFileIds])

  if (fileIds.size > maxSessionFiles) {
    emit('error', `A session can contain up to ${maxSessionFiles} files.`)
    return
  }

  // Confirm replacements before starting any upload, so no dialog blocks mid-flight
  const uploads = Array.from(files).filter((file) => {
    const id = slugifyFile(file.name)
    const current = Object.hasOwn(props.files, id) ? props.files[id] : undefined

    return !current || confirm(`The file "${current.name}" already exists, replace it?`)
  })

  if (uploads.length === 0) {
    return
  }

  emit('loading', true)

  try {
    if (props.encryptionKey) {
      for (const file of uploads) {
        await uploadFile(file)
      }
    } else {
      await Promise.all(uploads.map((file) => uploadFile(file)))
    }
  } finally {
    emit('loading', false)
  }
}

async function deleteFile(file: UploadedFile) {
  if (!confirm(`Are you sure you want to delete "${file.name}"?`)) {
    return
  }

  emit('loading', true)

  try {
    await http.delete(fileApiUrl(file.id), undefined, {
      headers: { 'Session-Client-Id': props.clientId },
    })
  } catch (e) {
    handleRequestError(e)
  } finally {
    emit('loading', false)
  }
}

async function onInputChange(event: Event) {
  const input = event.target

  if (!(input instanceof HTMLInputElement) || !input.files) {
    return
  }

  try {
    await uploadFiles(input.files)
  } finally {
    input.value = ''
  }
}

function onDragEnter(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files')) {
    dragActive.value = true
  }
}

function onDragLeave(event: DragEvent) {
  const related = event.relatedTarget

  // relatedTarget is null when the pointer leaves the window entirely
  if (!(related instanceof Node) || !dropZone.value?.contains(related)) {
    dragActive.value = false
  }
}

async function onDrop(event: DragEvent) {
  dragActive.value = false

  if (event.dataTransfer) {
    await uploadFiles(event.dataTransfer.files)
  }
}

function handleRequestError(e: unknown) {
  if ((e as { status?: number })?.status === 401) {
    emit('error', 'Session connection lost, reconnecting...')
    emit('reconnect')
    return
  }

  emit('error', e)
}
</script>

<template>
  <div
    ref="dropZone"
    class="content-box border-primary"
    :class="{ border: dragActive }"
    @dragenter.prevent="onDragEnter"
    @dragleave.prevent="onDragLeave"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <h2>Files</h2>
    <div class="row gy-3 text-center mb-2">
      <div v-for="file in files" :key="file.id" class="col-xl-2 col-md-3">
        <button type="button" v-if="encryptionKey" @click="downloadFile(file)" class="btn btn-link">
          <FileIcon :filename="file.name" class="fs-1" />
          <br />
          {{ file.name }}
        </button>

        <a v-else :href="fileDownloadUrl(file)" :download="file.name">
          <FileIcon :filename="file.name" class="fs-1" />
          <br />
          {{ file.name }}
        </a>

        <br />

        <small class="d-block">{{ formatBytes(file.size) }}</small>

        <button
          :disabled="loading"
          type="button"
          @click="deleteFile(file)"
          class="btn btn-danger btn-sm mt-2"
          title="Delete"
        >
          <BIconTrash />
        </button>
      </div>

      <div class="col-xl-2 col-md-3">
        <div v-if="loading">
          <div class="spinner-border" role="status" />
          <br />
          Loading...
        </div>
        <button v-else type="button" @click="fileUpload?.click()" class="btn btn-link">
          <BIconFileEarmarkPlus class="fs-1" />
          <br />
          Upload
        </button>
      </div>
    </div>

    <div class="text-center small"><BIconCloudArrowUpFill /> Drag and drop files here</div>

    <input @change="onInputChange" type="file" multiple ref="fileUpload" class="d-none" />
  </div>
</template>
