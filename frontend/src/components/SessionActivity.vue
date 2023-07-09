<script setup lang="ts">
import type { LogEvent } from '@/utils/api'

import {
  BIconChatFill,
  BIconDashCircleFill,
  BIconPersonDashFill,
  BIconPersonPlusFill,
  BIconPlusCircleFill,
  BIconSend,
} from 'bootstrap-icons-vue'
import { ref, watch } from 'vue'

const emit = defineEmits<{ message: [message: string] }>()
const props = defineProps<{ logs: LogEvent[] }>()

const message = ref('')
const loading = ref(false)

watch(props.logs, async (logs) => {
  if (!loading.value) {
    return
  }

  if (logs.find((l) => l.type === 'message' && l.message === message.value)) {
    message.value = ''
    loading.value = false
  }
})

function sendMessage() {
  emit('message', message.value)

  loading.value = true
}

function formatLogEvent(event: LogEvent) {
  switch (event.type) {
    case 'user_join':
      return `${event.user} joined the session`
    case 'user_leave':
      return `${event.user} left the session`
    case 'file_upload':
      return `${event.user} uploaded a file: ${event.file.name}`
    case 'file_delete':
      return `${event.user} deleted a file: ${event.file.name}`
    case 'message':
      return `${event.user}: ${event.message}`
    default:
      return `${event.user} [${event.type}]`
  }
}
</script>

<template>
  <div class="col-md-4">
    <div class="position-relative h-100 activity-box">
      <div class="position-absolute top-0 bottom-0 start-0 end-0 content-box d-flex flex-column">
        <h2 class="mb-1">Session Activity</h2>

        <div class="overflow-auto d-flex flex-column-reverse pt-2">
          <p
            v-for="log in logs"
            :key="log.type + log.date"
            :title="log.date.toString()"
            class="mb-1"
          >
            <BIconPersonPlusFill v-if="log.type === 'user_join'" />
            <BIconPersonDashFill v-else-if="log.type === 'user_leave'" />
            <BIconPlusCircleFill v-else-if="log.type === 'file_upload'" />
            <BIconDashCircleFill v-else-if="log.type === 'file_delete'" />
            <BIconChatFill v-else-if="log.type === 'message'" />
            {{ formatLogEvent(log) }}
          </p>
        </div>

        <form class="input-group mt-auto pt-1" @submit.prevent="sendMessage">
          <input
            v-model.trim="message"
            type="text"
            class="form-control"
            placeholder="Send a message"
            maxlength="128"
            :disabled="loading"
          />
          <button
            type="submit"
            class="btn btn-primary"
            title="Send"
            :disabled="!message || loading"
          >
            <span v-if="loading" class="spinner-border spinner-border-sm" />
            <BIconSend v-else />
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<style>
.activity-box {
  min-height: 300px;
}
</style>
