<script setup lang="ts">
import QRCode from 'qrcode-svg'
import { computed } from 'vue'

const props = defineProps<{ show: boolean; value: string }>()

const emit = defineEmits<{ (e: 'close'): void }>()

const svg = computed(() =>
  new QRCode({
    content: props.value,
    join: true,
  })
    .svg()
    .replace(/<rect.*\/>/, '')
    .replace(/style=".*;"/, 'fill="#000"'),
)
</script>

<template>
  <Transition>
    <div
      v-if="show"
      class="modal fade show d-block"
      id="qrModal"
      tabindex="-1"
      aria-labelledby="qrModalLabel"
      @click="emit('close')"
    >
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h1 class="modal-title fs-5" id="qrModalLabel">
              Invite to session
            </h1>
            <button
              type="button"
              class="btn-close"
              aria-label="Close"
              @click="emit('close')"
            ></button>
          </div>
          <div class="modal-body text-center svg-qrcode" v-html="svg" />
        </div>
      </div>
    </div>
  </Transition>

  <div v-if="show" class="modal-backdrop show" />
</template>

<style scoped>
.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>
