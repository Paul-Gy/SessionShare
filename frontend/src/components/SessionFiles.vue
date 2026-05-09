<script setup lang="ts">
import type { FilesIndex, UploadedFile } from '@/utils/api'

import { BIconCloudArrowUpFill, BIconFileEarmarkPlus, BIconTrash } from 'bootstrap-icons-vue'
import { ref, useTemplateRef } from 'vue'
import wretch from 'wretch'

import FileIcon from '@/components/FileIcon.vue'
import { decryptFromBase64, encryptAsBase64 } from '@/utils/crypto'
import { downloadBlob, formatBytes, readFile } from '@/utils/utils'

const props = defineProps<{
  bucketDomain?: string
  encryptionKey: string
  loading: boolean
  user: string
  session: string
  files: FilesIndex
}>()
const emit = defineEmits<{
  loading: [value: boolean]
  error: [error: unknown]
}>()

const fileUpload = useTemplateRef('fileUpload')
const dragActive = ref(false)

function fileUrl(file: string) {
  return `/api/sessions/${props.session}/files/${file}`
}

function downloadUrl(file: string) {
  const bucket = props.bucketDomain
  return bucket ? `https://${bucket}/${props.session}-${file}` : fileUrl(file)
}

async function downloadFile(file: UploadedFile) {
  if (file.encrypted && !props.encryptionKey) {
    emit('error', 'This file is encrypted but no encryption key is present in the URL.')
    return
  }

  emit('loading', true)

  try {
    const request = wretch(downloadUrl(file.id)).get()
    const blob = file.encrypted
      ? await decryptFromBase64(await request.text(), props.encryptionKey)
      : await request.blob()

    downloadBlob(blob, file.id, file.type ?? 'application/download')
  } catch (e) {
    emit('error', e)
  }

  emit('loading', false)
}

async function uploadFile(file: File) {
  if (props.files[file.name] && !confirm(`The file "${file.name}" already exists, replace it?`)) {
    return
  }

  if (file.size > 100 * 1024 * 1024) {
    emit('error', `The file "${file.name}" is too large, max upload size is 100 MB.`)
    return
  }

  try {
    const body = props.encryptionKey
      ? await encryptAsBase64(await readFile(file), props.encryptionKey)
      : file

    await wretch(fileUrl(file.name))
      .headers({
        'Content-Type': file.type,
        'Session-Name': props.user,
        'X-Encrypted': Boolean(props.encryptionKey).toString(),
      })
      .post(body)
      .res()
  } catch (e) {
    emit('error', e)
  }
}

async function uploadFiles(files: FileList) {
  if (Object.keys(props.files).length > 25 || files.length > 25) {
    emit('error', 'A session can contain up to 25 files.')
    return
  }

  if (props.loading) {
    return
  }

  emit('loading', true)

  await Promise.all(Array.from(files).map((file) => uploadFile(file)))

  emit('loading', false)
}

async function deleteFile(fileId: string) {
  if (!confirm(`Are you sure you want to delete ${fileId} ?`)) {
    return
  }

  emit('loading', true)

  try {
    await wretch(fileUrl(fileId)).headers({ 'Session-Name': props.user }).delete().res()
  } catch (e) {
    emit('error', e)
  }

  emit('loading', false)
}

function setDragActive(active: boolean) {
  dragActive.value = active
}

async function onInputChange(event: Event) {
  if (event.target instanceof HTMLInputElement && event.target.files) {
    await uploadFiles(event.target.files)
  }
}

async function onDrop(event: DragEvent) {
  if (event.dataTransfer) {
    await uploadFiles(event.dataTransfer.files)
  }

  setDragActive(false)
}
</script>

<template>
  <div
    class="content-box border-primary"
    :class="{ border: dragActive }"
    @dragover.prevent="setDragActive(true)"
    @dragleave.prevent="setDragActive(false)"
    @drop.prevent="onDrop"
  >
    <h2>Files</h2>
    <div class="row gy-3 text-center mb-2">
      <div v-for="file in files" :key="file.id" class="col-xl-2 col-md-3">
        <a v-if="file.encrypted" @click.prevent="downloadFile(file)" href="#">
          <FileIcon :filename="file.name" class="fs-1" />
          <br />
          {{ file.name }}
        </a>

        <a v-else :href="downloadUrl(file.id)" :download="file.name">
          <FileIcon :filename="file.name" class="fs-1" />
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
          <BIconTrash aria-label="Delete" />
        </button>
      </div>

      <div class="col-xl-2 col-md-3">
        <div v-if="loading">
          <div class="spinner-border" role="status" />
          <br />
          Loading...
        </div>
        <a v-else href="#" @click.prevent="fileUpload?.click()">
          <BIconFileEarmarkPlus class="fs-1" />
          <br />
          Upload
        </a>
      </div>
    </div>

    <div class="text-center small">
      <BIconCloudArrowUpFill />
      Drag and drop to upload a file
    </div>

    <input @change="onInputChange" type="file" multiple ref="fileUpload" class="d-none" />
  </div>
</template>
