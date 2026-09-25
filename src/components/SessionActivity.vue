<script setup lang="ts">
import type { Component } from 'vue'
import type { LogEvent } from '@/utils/api'

import {
  BIconChatFill,
  BIconDashCircleFill,
  BIconPersonDashFill,
  BIconPersonPlusFill,
  BIconPlusCircleFill,
  BIconSend,
} from 'bootstrap-icons-vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import LinkifyText from '@/components/LinkifyText.vue'

const logIcons: Partial<Record<LogEvent['type'], Component>> = {
  user_join: BIconPersonPlusFill,
  user_leave: BIconPersonDashFill,
  file_upload: BIconPlusCircleFill,
  file_delete: BIconDashCircleFill,
  message: BIconChatFill,
}

const emit = defineEmits<{ message: [message: string, id: number] }>()
const props = defineProps<{ logs: LogEvent[]; user: string; rejoining: boolean }>()

const message = ref('')
const messageLoading = ref(false)

let messageLoadingTimeout: number | undefined
let pendingMessageId = Date.now()

onBeforeUnmount(() => clearTimeout(messageLoadingTimeout))

watch(
  () => props.logs[0]?.id,
  () => {
    if (!messageLoading.value) {
      return
    }

    const received = props.logs.some(
      (l) => l.type === 'message' && l.user === props.user && l.messageId === pendingMessageId,
    )

    // Reset the message input if the message was received successfully
    if (received) {
      message.value = ''
      stopMessageLoading()
    }
  },
)

function sendMessage() {
  if (!message.value || messageLoading.value || props.rejoining) {
    return
  }

  emit('message', message.value, ++pendingMessageId)

  messageLoading.value = true
  messageLoadingTimeout = setTimeout(stopMessageLoading, 5_000)
}

function stopMessageLoading() {
  clearTimeout(messageLoadingTimeout)
  messageLoading.value = false
  messageLoadingTimeout = undefined
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
    default:
      return `${event.user} [${event.type}]`
  }
}
</script>

<template>
  <div class="col-lg-4">
    <div class="position-relative h-100 activity-box">
      <div class="position-absolute top-0 bottom-0 start-0 end-0 content-box d-flex flex-column">
        <h2 class="mb-1">Session Activity</h2>

        <div
          class="overflow-auto d-flex flex-column-reverse pt-2"
          role="log"
          aria-live="polite"
          aria-label="Session activity log"
        >
          <p v-for="log in logs" :key="log.id" :title="log.date.toLocaleString()" class="mb-1">
            <component :is="logIcons[log.type]" v-if="logIcons[log.type]" />

            <LinkifyText
              v-if="log.type === 'message'"
              :text="`${log.user}: ${log.message}`"
              class="ms-1"
            />

            <span v-else class="ms-1">{{ formatLogEvent(log) }}</span>
          </p>
        </div>

        <form class="input-group mt-auto pt-1" @submit.prevent="sendMessage">
          <input
            v-model.trim="message"
            type="text"
            class="form-control"
            placeholder="Send a message"
            aria-label="Send a message"
            maxlength="128"
            :disabled="messageLoading"
          />
          <button
            type="submit"
            class="btn btn-primary"
            title="Send"
            :disabled="!message || messageLoading || rejoining"
          >
            <span v-if="messageLoading" class="spinner-border spinner-border-sm" />
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
