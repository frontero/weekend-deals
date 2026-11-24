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
    class="inline-flex min-w-0 max-w-full items-center gap-2 rounded-lg bg-surface px-3 py-2 text-left text-sm ring-1 ring-line transition hover:ring-field"
    @click="emit('edit')"
  >
    <span class="sr-only">Gezelschap:</span>
    <Icon
      name="users"
      class="size-4 shrink-0 text-ink-secondary"
    />
    <span class="min-w-0 font-medium">{{ party }}</span>
    <span class="hidden h-4 w-px shrink-0 bg-line sm:block" />
    <Icon
      name="home"
      class="hidden size-4 shrink-0 text-ink-secondary sm:block"
    />
    <span class="min-w-0 truncate max-sm:sr-only">{{ accommodation }}</span>
    <span class="font-medium text-accent max-[360px]:sr-only">Wijzig</span>
  </button>
</template>
