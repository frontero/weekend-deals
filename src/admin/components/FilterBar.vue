<script setup>
import { RANGES, SIZES, useAdmin } from '../useAdmin.js';

// The filters for every chart below them: the party size whose prices are shown, and how far back.
defineProps({ withRange: { type: Boolean, default: true } });
const { size, range } = useAdmin();
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <fieldset class="flex items-center gap-2">
      <legend class="sr-only">Groepsgrootte</legend>
      <span class="text-sm text-ink-secondary" aria-hidden="true">Personen</span>
      <div class="flex rounded-xl bg-plane p-0.5 ring-1 ring-line">
        <label
          v-for="item in SIZES"
          :key="item.key"
          class="grid h-8 min-w-9 cursor-pointer place-items-center rounded-lg px-2 text-sm font-medium tabular-nums transition select-none has-checked:bg-surface has-checked:text-ink has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-accent text-ink-secondary hover:text-ink"
        >
          <input v-model="size" type="radio" name="admin-size" :value="item.key" class="sr-only" />
          <span>{{ item.persons }}<span class="sr-only"> personen</span></span>
        </label>
      </div>
    </fieldset>
    <label v-if="withRange" class="flex items-center gap-2 text-sm">
      <span class="text-ink-secondary">Periode</span>
      <select v-model.number="range" class="h-9 rounded-xl bg-surface px-3 font-medium ring-1 ring-field">
        <option v-for="item in RANGES" :key="item.days" :value="item.days">Laatste {{ item.label }}</option>
      </select>
    </label>
  </div>
</template>
