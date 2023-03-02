<script setup lang="ts">
import { BIconCheckLg, BIconClipboard, BIconQrCode } from 'bootstrap-icons-vue'
import QRCode from 'qrcode-svg'
import { computed, ref } from 'vue'

const props = defineProps<{ value: string }>()

const modal = ref(false)
const copied = ref(false)

const svg = computed(() =>
  new QRCode({
    content: props.value,
    join: true,
  })
    .svg()
    .replace(/<rect.*\/>/, '')
    .replace(/style=".*;"/, 'fill="#000"'),
)

async function copy() {
  await navigator.clipboard.writeText(props.value)

  copied.value = true

  setTimeout(() => (copied.value = false), 1500)
}

function showModal() {
  modal.value = true
}

function closeModal() {
  modal.value = false
}
</script>

<template>
  <div class="input-group">
    <button
      @click="showModal"
      type="button"
      class="btn btn-secondary"
      title="QR Code"
    >
      <BIconQrCode />
    </button>

    <input
      type="url"
      id="session"
      class="form-control"
      readonly
      :value="value"
    />

    <button type="button" class="btn btn-primary" @click="copy" title="Copy">
      <BIconCheckLg v-if="copied" aria-label="Copied!" />
      <BIconClipboard v-else aria-label="Copy" />
    </button>
  </div>

  <Transition>
    <div
      v-if="modal"
      class="modal fade show d-block"
      id="qrModal"
      tabindex="-1"
      aria-labelledby="qrModalLabel"
      @click="closeModal"
    >
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h1 class="modal-title fs-5" id="qrModalLabel">
              Invite to session
            </h1>
            <button
              type="button"
              class="btn-close dark-svg"
              aria-label="Close"
              @click="closeModal"
            ></button>
          </div>
          <div class="modal-body text-center dark-svg" v-html="svg" />
        </div>
      </div>
    </div>
  </Transition>

  <div v-if="modal" class="modal-backdrop show" />
</template>

<style scoped>
.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>
