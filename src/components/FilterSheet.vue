<script setup>
import { ref, watch } from 'vue';
import Icon from './Icon.vue';

const open = defineModel('open', { type: Boolean, required: true });
defineProps({
  resultCount: { type: Number, required: true },
  canClear: { type: Boolean, required: true },
});
const emit = defineEmits(['clear']);

const dialog = ref(null);
watch(open, (isOpen) => {
  if (isOpen) dialog.value.showModal();
  else if (dialog.value?.open) dialog.value.close();
});
</script>

<template>
  <!-- Phone-sized filters: the same panel as the sidebar, as a sheet from the bottom. -->
  <dialog
    ref="dialog"
    class="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-2xl bg-plane p-0 text-ink shadow-2xl"
    aria-labelledby="filters-title"
    @close="open = false"
  >
    <div class="flex max-h-[92dvh] flex-col">
      <header class="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <h2 id="filters-title" class="text-lg font-semibold">Filters</h2>
        <button type="button" class="rounded-full p-2 hover:bg-hover" aria-label="Sluiten" @click="open = false">
          <Icon name="x" class="size-5" />
        </button>
      </header>
      <div class="flex-1 overflow-y-auto px-4 py-4">
        <slot />
      </div>
      <footer class="flex items-center gap-3 border-t border-line bg-surface px-4 py-3">
        <button
          type="button"
          class="font-medium underline disabled:no-underline disabled:opacity-40"
          :disabled="!canClear"
          @click="emit('clear')"
        >
          Wis alles
        </button>
        <button
          type="button"
          class="ml-auto rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent hover:bg-accent-hover"
          @click="open = false"
        >
          Toon {{ resultCount }} {{ resultCount === 1 ? 'park' : 'parken' }}
        </button>
      </footer>
    </div>
  </dialog>
</template>
