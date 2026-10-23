<script setup>
import { ref } from 'vue';
import Icon from './Icon.vue';

// { label, lat, lng } of the home address, or null.
const origin = defineModel('origin', { type: Object, default: null });
const maxDistanceKm = defineModel('maxDistanceKm', { type: Number, default: null });

const RADII = [25, 50, 100, 150, 250, null];
const DEFAULT_RADIUS_KM = 100;

const query = ref('');
const places = ref([]);
const status = ref('idle');

async function search() {
  if (!query.value.trim()) return;
  status.value = 'loading';
  try {
    const response = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.value }),
    });
    if (!response.ok) throw new Error(`Geocoding failed with ${response.status}`);
    places.value = await response.json();
    status.value = places.value.length ? 'idle' : 'empty';
  } catch {
    status.value = 'error';
  }
}

function choose(place) {
  origin.value = place;
  maxDistanceKm.value ??= DEFAULT_RADIUS_KM;
  places.value = [];
  query.value = '';
}

function clear() {
  origin.value = null;
  maxDistanceKm.value = null;
}

const radiusClass = (active) =>
  active ? 'bg-accent text-on-accent font-semibold' : 'text-ink-secondary hover:bg-hover hover:text-ink';
</script>

<template>
  <section>
    <h3 class="mb-2 font-semibold">Afstand vanaf huis</h3>

    <template v-if="origin">
      <div class="flex items-start gap-2 rounded-lg bg-surface p-2 ring-1 ring-line">
        <Icon name="pin" class="mt-0.5 size-4 text-accent" />
        <span class="min-w-0 flex-1 leading-snug">{{ origin.label }}</span>
        <button type="button" class="rounded p-0.5 text-ink-secondary hover:bg-hover hover:text-ink" aria-label="Adres wissen" @click="clear">
          <Icon name="x" class="size-4" />
        </button>
      </div>
      <div class="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-surface p-1 ring-1 ring-line" role="radiogroup" aria-label="Maximale afstand">
        <button
          v-for="radius in RADII"
          :key="radius ?? 'all'"
          type="button"
          role="radio"
          :aria-checked="maxDistanceKm === radius"
          class="rounded-md py-1.5 tabular-nums transition"
          :class="radiusClass(maxDistanceKm === radius)"
          @click="maxDistanceKm = radius"
        >
          {{ radius ? `${radius} km` : 'Alle' }}
        </button>
      </div>
      <p class="mt-1.5 text-xs text-ink-muted">Hemelsbreed gemeten. Alleen in deze browser bewaard.</p>
    </template>

    <template v-else>
      <form class="flex gap-2" @submit.prevent="search">
        <label class="min-w-0 flex-1">
          <span class="sr-only">Adres, postcode of plaats</span>
          <input
            v-model="query"
            type="text"
            placeholder="Adres, postcode of plaats"
            autocomplete="street-address"
            class="w-full rounded-lg bg-surface px-3 py-2 ring-1 ring-field focus:ring-2 focus:ring-accent focus:outline-none"
          />
        </label>
        <button
          type="submit"
          class="rounded-lg bg-surface px-3 py-2 font-medium ring-1 ring-line hover:ring-field disabled:opacity-50"
          :disabled="status === 'loading'"
        >
          Zoek
        </button>
      </form>
      <ul v-if="places.length" class="mt-2 overflow-hidden rounded-lg bg-surface ring-1 ring-line" aria-label="Gevonden adressen">
        <li v-for="place in places" :key="place.label" class="border-b border-line last:border-b-0">
          <button type="button" class="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-hover" @click="choose(place)">
            <Icon name="pin" class="mt-0.5 size-4 text-ink-muted" />
            <span class="leading-snug">{{ place.label }}</span>
          </button>
        </li>
      </ul>
      <p v-if="status === 'loading'" class="mt-2 text-ink-secondary">Zoeken…</p>
      <p v-else-if="status === 'empty'" class="mt-2 text-ink-secondary">Niets gevonden. Probeer een postcode of plaatsnaam.</p>
      <p v-else-if="status === 'error'" class="mt-2 text-warning-ink">Zoeken lukte niet. Probeer het zo nog eens.</p>
    </template>
  </section>
</template>
