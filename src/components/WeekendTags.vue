<script setup>
// A weekend's good weather (only ever passed on when good, see server/weather.mjs) and what makes it special
// (shared/occasions.mjs), as small labels; `explain` adds the occasions' sentences below them.
defineProps({
  weather: { type: Object, default: null },
  occasions: { type: Array, default: () => [] },
  explain: { type: Boolean, default: false },
});
</script>

<template>
  <div v-if="weather || occasions.length" class="flex flex-col gap-1">
    <p class="flex flex-wrap gap-1.5">
      <span
        v-if="weather"
        class="rounded-full bg-warning-wash px-2 py-0.5 text-xs font-semibold text-warning-ink"
        title="Weersverwachting van MET Norway (yr.no)"
      >
        <span aria-hidden="true">☀</span> Zonnig verwacht, tot {{ weather.maxTemp }} °C
      </span>
      <span
        v-for="occasion in occasions"
        :key="occasion.label"
        class="rounded-full bg-accent-wash px-2 py-0.5 text-xs font-medium text-accent"
        :title="occasion.text"
      >
        {{ occasion.label }}
      </span>
    </p>
    <p v-if="explain && occasions.length" class="text-sm text-ink-secondary">
      {{ occasions.map((occasion) => occasion.text).join(' ') }}
    </p>
    <p v-if="explain && weather" class="text-xs text-ink-muted">Weersverwachting van MET Norway (yr.no).</p>
  </div>
</template>
