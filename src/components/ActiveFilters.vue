<script setup>
import Icon from './Icon.vue';

defineProps({
  // [{ key, label }]
  chips: { type: Array, required: true },
});
const emit = defineEmits(['remove', 'clear']);
</script>

<template>
  <ul v-if="chips.length" class="flex flex-wrap items-center gap-2 text-sm" aria-label="Actieve filters">
    <li v-for="chip in chips" :key="chip.key">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full bg-accent-wash py-1 pr-2 pl-3 font-medium text-ink ring-1 ring-accent/30 hover:ring-accent"
        :aria-label="`Filter ${chip.label} weghalen`"
        @click="emit('remove', chip.key)"
      >
        {{ chip.label }}
        <Icon name="x" class="size-3.5" />
      </button>
    </li>
    <li>
      <button type="button" class="px-1 font-medium text-accent hover:underline" @click="emit('clear')">Wis alles</button>
    </li>
  </ul>
</template>
