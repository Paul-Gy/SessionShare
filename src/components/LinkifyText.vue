<script setup lang="ts">
import { LinkifyIt } from 'linkify-it'
import { computed } from 'vue'

const linkify = new LinkifyIt()

const props = defineProps<{ text: string }>()
const links = computed(() => linkify.match(props.text) ?? [])
// slice(0, undefined) returns the whole text when there is no link
const prefix = computed(() => props.text.slice(0, links.value[0]?.index))
</script>

<template>
  <span>
    {{ prefix }}
    <template v-for="(link, index) in links" :key="link.index">
      <a :href="link.url" target="_blank" rel="noopener noreferrer">{{ link.text }}</a>

      {{ text.slice(link.lastIndex, links[index + 1]?.index) }}
    </template>
  </span>
</template>
