<script setup lang="ts">
import LinkifyIt from 'linkify-it'
import { computed } from 'vue'

const linkify = new LinkifyIt({ fuzzyLink: false })

const props = defineProps<{ text: string }>()
const links = computed(() => linkify.match(props.text) ?? [])
</script>

<template>
  <span>
    <template v-if="links.length === 0">
      {{ props.text }}
    </template>

    <template v-else-if="links[0] && links[0].index > 0">
      {{ text.slice(0, links[0].index) }}
    </template>

    <template v-for="(link, index) in links" :key="link.index">
      <a :href="link.url" target="_blank" rel="noopener noreferrer">
        {{ link.text }}
      </a>

      <template v-if="link.lastIndex < text.length">
        {{ text.slice(link.lastIndex, links[index + 1]?.index) }}
      </template>
    </template>
  </span>
</template>
