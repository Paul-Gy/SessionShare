<script setup lang="ts">
import {
  BIconFileEarmark,
  BIconFileEarmarkBinary,
  BIconFileEarmarkCode,
  BIconFileEarmarkFont,
  BIconFileEarmarkImage,
  BIconFileEarmarkMusic,
  BIconFileEarmarkPdf,
  BIconFileEarmarkPerson,
  BIconFileEarmarkPlay,
  BIconFileEarmarkRichtext,
  BIconFileEarmarkSlides,
  BIconFileEarmarkSpreadsheet,
  BIconFileEarmarkZip,
} from 'bootstrap-icons-vue'
import { computed } from 'vue'
import types from '@/utils/filetypes'

const props = defineProps<{ filename: string }>()

const type = computed(() => props.filename.toLowerCase().split('.').pop() ?? '')
</script>

<template>
  <BIconFileEarmarkPdf v-if="type === 'pdf'" />
  <BIconFileEarmarkImage v-else-if="types.image.includes(type)" />
  <BIconFileEarmarkMusic v-else-if="types.audio.includes(type)" />
  <BIconFileEarmarkPlay v-else-if="types.video.includes(type)" />
  <BIconFileEarmarkRichtext v-else-if="types.doc.includes(type)" />
  <BIconFileEarmarkSpreadsheet v-else-if="types.spreadsheet.includes(type)" />
  <BIconFileEarmarkSlides v-else-if="types.presentation.includes(type)" />
  <BIconFileEarmarkBinary v-else-if="types.bin.includes(type)" />
  <BIconFileEarmarkFont v-else-if="types.font.includes(type)" />
  <BIconFileEarmarkPerson v-else-if="types.contact.includes(type)" />
  <BIconFileEarmarkZip v-else-if="types.archive.includes(type)" />
  <BIconFileEarmarkCode v-else-if="types.code.includes(type)" />
  <BIconFileEarmark v-else />
</template>
