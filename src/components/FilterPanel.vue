<script setup>
import { computed, ref, useId } from 'vue';
import Icon from './Icon.vue';
import LocationFilter from './LocationFilter.vue';

const search = defineModel('search', { type: String, required: true });
const minDiscountPercent = defineModel('minDiscountPercent', { type: Number, required: true });
const maxPriceEuros = defineModel('maxPriceEuros', { type: [Number, String], default: null });
const minRating = defineModel('minRating', { type: Number, required: true });
const country = defineModel('country', { type: String, required: true });
const facilities = defineModel('facilities', { type: Array, required: true });
const brands = defineModel('brands', { type: Array, required: true });
const origin = defineModel('origin', { type: Object, default: null });
const maxDistanceKm = defineModel('maxDistanceKm', { type: Number, default: null });
const props = defineProps({
  // [{ value, label, dot, count }]; the section shows once there is more than one brand.
  brandOptions: { type: Array, required: true },
  // [{ value, label, count }]
  countryOptions: { type: Array, required: true },
  ratingOptions: { type: Array, required: true },
  // Facility groups whose options carry a `count` of matching parks.
  facilityGroups: { type: Array, required: true },
  ratingsAvailable: { type: Boolean, required: true },
});

// The panel renders twice (sidebar and phone sheet); radio groups need names of their own.
const id = useId();
// 0 turns the discount filter off: every weekend, also at or above the normal price.
const DISCOUNT_STEPS = [0, 10, 20, 30, 40];
const COLLAPSED_OPTIONS = 4;
const expandedGroups = ref(new Set());

const groups = computed(() =>
  props.facilityGroups.map((group) => {
    const expanded = expandedGroups.value.has(group.name);
    const options = group.options.map((option) => ({
      ...option,
      disabled: option.count === 0 && !facilities.value.includes(option.id),
    }));
    return {
      ...group,
      expanded,
      visible: expanded ? options : options.slice(0, COLLAPSED_OPTIONS),
      hiddenCount: Math.max(0, options.length - COLLAPSED_OPTIONS),
    };
  }),
);

function toggleGroup(name) {
  const next = new Set(expandedGroups.value);
  next.has(name) ? next.delete(name) : next.add(name);
  expandedGroups.value = next;
}

const segmentClass = (active) =>
  active ? 'bg-accent text-on-accent font-semibold' : 'text-ink-secondary hover:bg-hover hover:text-ink';
</script>

<template>
  <div class="flex flex-col divide-y divide-line text-sm">
    <section class="pb-4">
      <label class="relative block">
        <span class="sr-only">Zoek een park of regio</span>
        <Icon name="search" class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
        <input
          v-model="search"
          type="search"
          placeholder="Park of regio"
          class="w-full rounded-lg bg-surface py-2 pr-3 pl-9 ring-1 ring-field focus:ring-2 focus:ring-accent focus:outline-none"
        />
      </label>
    </section>

    <LocationFilter v-model:origin="origin" v-model:max-distance-km="maxDistanceKm" class="py-4" />

    <section v-if="brandOptions.length > 1" class="py-4">
      <h3 class="mb-2 font-semibold">Soort park</h3>
      <div class="flex flex-col gap-0.5">
        <label
          v-for="option in brandOptions"
          :key="option.value"
          class="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 hover:bg-hover"
        >
          <input v-model="brands" type="checkbox" :value="option.value" class="accent-accent" />
          <span class="size-2 rounded-full" :style="{ backgroundColor: option.dot }" aria-hidden="true" />
          <span class="flex-1">{{ option.label }}</span>
          <span class="text-xs text-ink-muted tabular-nums">{{ option.count }}</span>
        </label>
      </div>
    </section>

    <section class="py-4">
      <h3 class="mb-2 font-semibold">Korting t.o.v. normaal</h3>
      <div class="grid grid-cols-5 gap-1 rounded-lg bg-surface p-1 ring-1 ring-line" role="radiogroup" aria-label="Minimale korting">
        <button
          v-for="step in DISCOUNT_STEPS"
          :key="step"
          type="button"
          role="radio"
          :aria-checked="minDiscountPercent === step"
          :aria-label="step ? undefined : 'Alle prijzen, ook zonder korting'"
          class="rounded-md py-1.5 tabular-nums transition"
          :class="segmentClass(minDiscountPercent === step)"
          @click="minDiscountPercent = step"
        >
          {{ step ? `${step}%+` : 'Alle' }}
        </button>
      </div>
    </section>

    <section class="py-4">
      <h3 class="mb-2 font-semibold">Maximale totaalprijs</h3>
      <label class="relative block">
        <span class="sr-only">Maximale totaalprijs in euro</span>
        <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted">€</span>
        <input
          v-model.number="maxPriceEuros"
          type="number"
          min="0"
          step="25"
          placeholder="Geen maximum"
          class="w-full rounded-lg bg-surface py-2 pr-3 pl-7 ring-1 ring-field focus:ring-2 focus:ring-accent focus:outline-none"
        />
      </label>
    </section>

    <section class="py-4">
      <h3 class="mb-2 font-semibold">Google-score</h3>
      <p v-if="!ratingsAvailable" class="text-ink-secondary">Nog geen Google-scores opgehaald.</p>
      <div v-else class="flex flex-col gap-0.5">
        <label
          v-for="option in ratingOptions"
          :key="option.value"
          class="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 hover:bg-hover"
        >
          <input v-model.number="minRating" type="radio" :name="`${id}-rating`" :value="option.value" class="accent-accent" />
          <span class="flex-1">{{ option.label }}</span>
          <span class="text-xs text-ink-muted tabular-nums">{{ option.count }}</span>
        </label>
      </div>
    </section>

    <section class="py-4">
      <h3 class="mb-2 font-semibold">Land</h3>
      <div class="flex flex-col gap-0.5">
        <label
          v-for="option in countryOptions"
          :key="option.value"
          class="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 hover:bg-hover"
        >
          <input v-model="country" type="radio" :name="`${id}-country`" :value="option.value" class="accent-accent" />
          <span class="flex-1">{{ option.label }}</span>
          <span class="text-xs text-ink-muted tabular-nums">{{ option.count }}</span>
        </label>
      </div>
    </section>

    <section class="py-4">
      <h3 class="font-semibold">Parkfaciliteiten</h3>
      <p v-if="!groups.length" class="mt-2 text-ink-secondary">Worden bij de volgende ophaalronde opgehaald.</p>
      <fieldset v-for="group in groups" :key="group.name" class="mt-3">
        <legend class="mb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">{{ group.name }}</legend>
        <label
          v-for="option in group.visible"
          :key="option.id"
          class="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 hover:bg-hover"
          :class="option.disabled ? 'cursor-default opacity-45 hover:bg-transparent' : ''"
        >
          <input v-model="facilities" type="checkbox" :value="option.id" :disabled="option.disabled" class="accent-accent" />
          <span class="flex-1">{{ option.name }}</span>
          <span class="text-xs text-ink-muted tabular-nums">{{ option.count }}</span>
        </label>
        <button
          v-if="group.hiddenCount"
          type="button"
          class="mt-1 px-1 font-medium text-accent hover:underline"
          @click="toggleGroup(group.name)"
        >
          {{ group.expanded ? 'Minder tonen' : `Toon alle ${group.options.length}` }}
        </button>
      </fieldset>
    </section>
  </div>
</template>
