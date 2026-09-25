<script setup lang="ts">
import type { Component } from 'vue'

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

const categoryIcons: Record<keyof typeof types, Component> = {
  image: BIconFileEarmarkImage,
  audio: BIconFileEarmarkMusic,
  video: BIconFileEarmarkPlay,
  doc: BIconFileEarmarkRichtext,
  spreadsheet: BIconFileEarmarkSpreadsheet,
  presentation: BIconFileEarmarkSlides,
  contact: BIconFileEarmarkPerson,
  archive: BIconFileEarmarkZip,
  binary: BIconFileEarmarkBinary,
  font: BIconFileEarmarkFont,
  code: BIconFileEarmarkCode,
  pdf: BIconFileEarmarkPdf,
}

const extensionIcons = new Map<string, Component>()

for (const [category, extensions] of Object.entries(types)) {
  for (const extension of extensions) {
    extensionIcons.set(extension, categoryIcons[category as keyof typeof types])
  }
}

const props = defineProps<{ filename: string }>()

const icon = computed(() => {
  const extension = props.filename.toLowerCase().split('.').pop() ?? ''

  return extensionIcons.get(extension) ?? BIconFileEarmark
})
</script>

<template>
  <component :is="icon" />
</template>
