<script setup>
import { ref } from 'vue';

// A chart with its title and its table twin: every value in the chart can also be read without it.
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  // { columns: [{ label, align }], rows: [[cell, ...]] }
  table: { type: Object, default: null },
  // Shown instead of the chart, e.g. while there is too little data.
  empty: { type: String, default: '' },
});

const showTable = ref(false);
</script>

<template>
  <section class="flex min-w-0 flex-col rounded-2xl bg-surface p-4 ring-1 ring-line sm:p-5">
    <div class="flex flex-wrap items-start gap-x-4 gap-y-2">
      <div class="min-w-0 flex-1">
        <h2 class="font-semibold">{{ title }}</h2>
        <p v-if="subtitle" class="mt-0.5 text-sm text-ink-secondary">{{ subtitle }}</p>
      </div>
      <div v-if="table && !empty" class="flex rounded-lg bg-plane p-0.5 text-xs font-medium ring-1 ring-line" role="group">
        <button
          type="button"
          class="rounded-md px-2.5 py-1"
          :class="showTable ? 'text-ink-secondary hover:text-ink' : 'bg-surface shadow-sm'"
          :aria-pressed="!showTable"
          @click="showTable = false"
        >
          Grafiek
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-1"
          :class="showTable ? 'bg-surface shadow-sm' : 'text-ink-secondary hover:text-ink'"
          :aria-pressed="showTable"
          @click="showTable = true"
        >
          Tabel
        </button>
      </div>
      <slot name="actions" />
    </div>

    <p v-if="empty" class="mt-4 grid min-h-40 flex-1 place-items-center rounded-xl bg-plane px-4 text-center text-sm text-ink-secondary">
      {{ empty }}
    </p>
    <div v-else-if="showTable && table" class="mt-4 max-h-96 overflow-auto rounded-xl ring-1 ring-line">
      <table class="w-full text-left text-sm">
        <thead class="sticky top-0 bg-surface text-ink-secondary">
          <tr class="border-b border-line">
            <th
              v-for="column in table.columns"
              :key="column.label"
              scope="col"
              class="px-3 py-2 font-medium whitespace-nowrap"
              :class="column.align === 'right' ? 'text-right' : ''"
            >
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody class="tabular-nums">
          <tr v-for="(row, index) in table.rows" :key="index" class="border-b border-line last:border-0">
            <td
              v-for="(cell, column) in row"
              :key="column"
              class="px-3 py-1.5 whitespace-nowrap"
              :class="table.columns[column].align === 'right' ? 'text-right' : ''"
            >
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="mt-2 min-w-0">
      <slot />
    </div>
    <slot name="footer" />
  </section>
</template>
