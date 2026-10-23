<script setup>
import { computed } from 'vue';
import { partyLabel, persons } from '../../shared/party.mjs';
import { accommodationFor, accommodationSummary, photosFor } from '../lib/accommodations.js';
import { formatEuros, formatPercent, formatWeekend, nights } from '../lib/format.js';
import { bookingUrl, providerName } from '../lib/providers.js';
import AdviceBadge from './AdviceBadge.vue';
import BrandBadge from './BrandBadge.vue';
import GoogleRating from './GoogleRating.vue';
import Icon from './Icon.vue';
import ParkLocation from './ParkLocation.vue';
import PhotoCarousel from './PhotoCarousel.vue';

const props = defineProps({
  deal: { type: Object, required: true },
  // The travel party and accommodation requirements, for the booking link.
  settings: { type: Object, required: true },
  // The party size the listed prices are for; the park panel gives the exact party's price.
  pricedFor: { type: Object, default: null },
});
const emit = defineEmits(['open']);

const park = computed(() => props.deal.park);
const weekend = computed(() => props.deal.weekend);
const provider = computed(() => providerName(park.value.provider));
const bookUrl = computed(() => bookingUrl(park.value, weekend.value, props.settings));
const saving = computed(() => formatEuros(park.value.baselineCents - weekend.value.priceCents));
// With the discount filter off, cards also show weekends at or above the park's normal price.
const belowNormal = computed(() => Math.round((weekend.value.discount ?? 0) * 100) > 0);
const comparedLabel = computed(() => {
  const { discount } = weekend.value;
  if (discount === null || belowNormal.value) return '';
  return Math.round(discount * 100) === 0 ? 'Normale prijs' : `${formatPercent(-discount)} boven normaal`;
});
// Says who the price is for: the same park costs more for more people.
const stay = computed(
  () => `${nights(weekend.value)} nachten · ${partyLabel(props.pricedFor ?? { adults: persons(props.settings), children: 0 })} · incl. toeslagen`,
);
const otherWeekends = computed(() => props.deal.otherWeekends?.length ?? 0);
const hasAdvice = computed(() => ['book', 'wait'].includes(weekend.value.advice?.verdict));
const photos = computed(() => photosFor(park.value, weekend.value));
const accommodation = computed(() => accommodationSummary(accommodationFor(park.value, weekend.value)));
</script>

<template>
  <!-- The whole card opens the park; the location, rating and booking links sit above that click area. -->
  <article
    class="group relative flex flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-line transition hover:shadow-lg hover:ring-field has-[h3_button:focus-visible]:ring-2 has-[h3_button:focus-visible]:ring-accent"
  >
    <!-- Above the card's click area so the photos can be swiped; a click still opens the park. -->
    <div class="relative z-10 aspect-[3/2] cursor-pointer overflow-hidden bg-line" @click="emit('open')">
      <PhotoCarousel :photos="photos" />
      <span
        v-if="belowNormal"
        class="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-good-wash px-2.5 py-1 text-sm font-semibold text-good-ink shadow-sm"
      >
        <Icon name="arrowDown" class="size-3.5" />
        {{ formatPercent(weekend.discount) }} onder normaal
      </span>
      <span
        v-else-if="comparedLabel"
        class="absolute top-3 left-3 rounded-full bg-surface/95 px-2.5 py-1 text-sm font-medium text-ink-secondary shadow-sm"
      >
        {{ comparedLabel }}
      </span>
      <AdviceBadge v-if="hasAdvice" :advice="weekend.advice" class="absolute top-3 right-3" />
      <span
        v-else-if="deal.dropCents"
        class="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-surface/95 px-2.5 py-1 text-xs font-medium shadow-sm"
        :title="`${formatEuros(deal.dropCents)} goedkoper dan eerder gezien`"
      >
        <Icon name="trendDown" class="size-3.5 text-good-ink" />
        Prijs gezakt
      </span>
    </div>

    <div class="flex flex-1 flex-col gap-1.5 p-4">
      <BrandBadge :brand="park.brand" class="self-start" />
      <h3 class="mt-0.5 leading-snug font-semibold">
        <button type="button" class="text-left after:absolute after:inset-0 focus-visible:outline-none" @click="emit('open')">
          {{ park.name }}
        </button>
      </h3>
      <ParkLocation :park="park" class="relative z-10 self-start" />
      <GoogleRating :rating="park.googleRating" class="relative z-10 self-start" />
      <p class="mt-1 flex items-center gap-1.5 text-sm font-medium">
        <Icon name="calendar" class="size-4 text-ink-secondary" />
        {{ formatWeekend(weekend) }}
        <span v-if="otherWeekends" class="font-normal text-ink-secondary">
          · +{{ otherWeekends }} {{ otherWeekends === 1 ? 'weekend' : 'weekenden' }}
        </span>
      </p>
      <p v-if="accommodation" class="flex min-w-0 items-center gap-1.5 text-sm text-ink-secondary" :title="accommodation">
        <Icon name="home" class="size-4" />
        <span class="truncate">{{ accommodation }}</span>
      </p>

      <div class="mt-auto flex items-end justify-between gap-3 pt-3">
        <div>
          <p v-if="belowNormal" class="text-sm text-ink-muted tabular-nums">
            <span class="sr-only">Normaal </span><span class="line-through">{{ formatEuros(park.baselineCents) }}</span>
          </p>
          <p v-else-if="park.baselineCents" class="text-sm text-ink-muted tabular-nums">
            normaal {{ formatEuros(park.baselineCents) }}
          </p>
          <p class="text-2xl leading-tight font-bold tabular-nums"><span class="sr-only">Nu </span>{{ formatEuros(weekend.priceCents) }}</p>
          <p class="text-xs text-ink-secondary">{{ stay }}</p>
          <p v-if="belowNormal" class="mt-1 text-sm font-medium text-good-ink">{{ saving }} onder normaal</p>
        </div>
        <a
          :href="bookUrl"
          target="_blank"
          rel="noopener"
          class="relative z-10 inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold whitespace-nowrap text-on-accent hover:bg-accent-hover"
          :aria-label="`Bekijk op ${provider}`"
          :title="`Boek via ${provider}`"
        >
          {{ provider }}
          <Icon name="external" class="size-4" />
        </a>
      </div>
    </div>
  </article>
</template>
