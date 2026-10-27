<script setup>
import { parkLocation } from '../lib/landal.js';
import Icon from './Icon.vue';

// Plain text: a link to Google Maps would send visitors away from the booking links; the site has its own map.
defineProps({ park: { type: Object, required: true } });
</script>

<template>
  <p class="flex items-center gap-1 text-sm text-ink-secondary">
    <Icon name="pin" class="size-4" />
    {{ parkLocation(park) }}
    <span v-if="park.distanceKm != null" class="text-ink-muted">· {{ park.distanceKm }} km</span>
  </p>
</template>
