<script setup lang="ts">
import type { LogEvent } from '@/utils/api'

import { BIconChevronDoubleRight } from 'bootstrap-icons-vue'

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

defineProps<{ logs: LogEvent[] }>()
</script>

<template>
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
          <BIconChevronDoubleRight /> {{ formatLogEvent(log) }}
        </p>
      </div>
    </div>
  </div>
</template>
