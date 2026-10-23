<script setup>
import Icon from './Icon.vue';

const value = defineModel({ type: Number, required: true });
const props = defineProps({
  label: { type: String, required: true },
  hint: { type: String, default: '' },
  min: { type: Number, required: true },
  max: { type: Number, required: true },
});

const change = (delta) => {
  value.value = Math.min(props.max, Math.max(props.min, value.value + delta));
};
</script>

<template>
  <div class="flex items-center justify-between gap-4 py-3">
    <div>
      <p class="font-medium">{{ label }}</p>
      <p v-if="hint" class="text-sm text-ink-secondary">{{ hint }}</p>
    </div>
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="grid size-8 place-items-center rounded-full ring-1 ring-axis transition hover:ring-ink disabled:opacity-30 disabled:hover:ring-axis"
        :disabled="value <= min"
        :aria-label="`${label} minder`"
        @click="change(-1)"
      >
        <Icon name="minus" class="size-4" />
      </button>
      <span class="w-6 text-center font-medium tabular-nums" aria-live="polite">{{ value }}</span>
      <button
        type="button"
        class="grid size-8 place-items-center rounded-full ring-1 ring-axis transition hover:ring-ink disabled:opacity-30 disabled:hover:ring-axis"
        :disabled="value >= max"
        :aria-label="`${label} meer`"
        @click="change(1)"
      >
        <Icon name="plus" class="size-4" />
      </button>
    </div>
  </div>
</template>
