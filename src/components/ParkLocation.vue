<script setup>
import { computed } from 'vue';
import { parkLocation, parkMapUrl } from '../lib/landal.js';
import Icon from './Icon.vue';

const props = defineProps({ park: { type: Object, required: true } });

const mapUrl = computed(() => parkMapUrl(props.park));
</script>

<template>
  <a
    v-if="mapUrl"
    :href="mapUrl"
    target="_blank"
    rel="noopener"
    class="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink hover:underline"
    :title="`${park.name} op Google Maps`"
    @click.stop
  >
    <Icon name="pin" class="size-4" />
    {{ parkLocation(park) }}
    <span v-if="park.distanceKm != null" class="text-ink-muted">· {{ park.distanceKm }} km</span>
  </a>
  <p v-else class="flex items-center gap-1 text-sm text-ink-secondary">
    <Icon name="pin" class="size-4" />
    {{ parkLocation(park) }}
  </p>
</template>
