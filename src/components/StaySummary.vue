<script setup>
import { computed } from 'vue';
import { describeAccommodation } from '../lib/stay.js';
import Icon from './Icon.vue';

const props = defineProps({
  settings: { type: Object, required: true },
  accommodationGroups: { type: Array, required: true },
});
const emit = defineEmits(['edit']);

const party = computed(() => {
  const { adults, children, pets } = props.settings;
  return [
    `${adults} volw.`,
    children ? `${children} ${children === 1 ? 'kind' : 'kind.'}` : null,
    pets ? `${pets} ${pets === 1 ? 'huisdier' : 'huisdieren'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
});
const accommodation = computed(
  () => describeAccommodation(props.settings.accommodationFeatures, props.accommodationGroups).join(', ') || 'Elk huisje',
);
</script>

<template>
  <button
    type="button"
    class="inline-flex max-w-full items-center gap-2 rounded-full bg-surface px-3 py-1 text-left ring-1 ring-line transition hover:ring-field"
    aria-label="Gezelschap en huisje wijzigen"
    @click="emit('edit')"
  >
    <Icon name="users" class="size-4 shrink-0 text-ink-secondary" />
    <span class="font-medium whitespace-nowrap">{{ party }}</span>
    <span class="h-4 w-px shrink-0 bg-line" />
    <Icon name="home" class="size-4 shrink-0 text-ink-secondary" />
    <span class="min-w-0 truncate">{{ accommodation }}</span>
    <span class="font-medium text-accent">Wijzig</span>
  </button>
</template>
