<script setup lang="ts">
import { BIconCheckLg, BIconClipboard, BIconQrCode } from 'bootstrap-icons-vue'
import QRCode from 'qrcode-svg'
import { computed, nextTick, onBeforeUnmount, ref, useId, useTemplateRef } from 'vue'

const props = defineProps<{ value: string }>()

const closeButton = useTemplateRef('closeButton')
const qrButton = useTemplateRef('qrButton')
const titleId = useId()

const modal = ref(false)
const copied = ref(false)
let copiedTimeout: number | undefined

const svg = computed(() =>
  new QRCode({
    content: props.value,
    join: true,
  })
    .svg()
    // Remove CSS to comply with content security policies without unsafe-eval for styles.
    .replace(/<rect[^>]*\/>/, '') // Remove background (no native qrcode-svg option for this)
    .replace(/style="[^"]*"/, 'fill="currentColor" shape-rendering="crispEdges"'),
)

onBeforeUnmount(() => {
  clearTimeout(copiedTimeout)
  document.body.classList.remove('modal-open')
})

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value)
  } catch (e) {
    console.error('Unable to copy to clipboard', e)
    prompt('Copy this link:', props.value)
    return
  }

  copied.value = true
  clearTimeout(copiedTimeout)
  copiedTimeout = setTimeout(() => (copied.value = false), 1500)
}

function showModal() {
  modal.value = true
  document.body.classList.add('modal-open')
  nextTick(() => closeButton.value?.focus())
}

function closeModal() {
  modal.value = false
  document.body.classList.remove('modal-open')
  nextTick(() => qrButton.value?.focus())
}
</script>

<template>
  <div class="input-group">
    <button
      ref="qrButton"
      @click="showModal"
      type="button"
      class="btn btn-secondary"
      title="QR Code"
    >
      <BIconQrCode />
    </button>

    <input type="url" class="form-control" readonly aria-label="Session URL" :value />

    <button type="button" class="btn btn-primary" @click="copy" title="Copy">
      <BIconCheckLg v-if="copied" aria-label="Copied!" />
      <BIconClipboard v-else aria-label="Copy" />
    </button>
  </div>

  <Transition>
    <!-- Tab always refocuses the close button, as it is the only focusable element in the modal -->
    <div v-if="modal" @keydown.esc="closeModal" @keydown.tab.prevent="closeButton?.focus()">
      <div class="modal-backdrop show" />

      <div
        class="modal fade show d-block"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @click.self="closeModal"
      >
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h1 class="modal-title fs-5" :id="titleId">Invite to session</h1>
              <button
                ref="closeButton"
                @click="closeModal"
                type="button"
                class="btn-close"
                aria-label="Close"
              />
            </div>
            <div class="modal-body text-center" v-html="svg" />
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.v-enter-from,
.v-leave-to {
  opacity: 0;
}

.v-enter-active,
.v-leave-active {
  transition: opacity 0.15s linear;
}
</style>
