<script setup>
import { computed } from 'vue';
import { partyLabel, persons } from '../../shared/party.mjs';
import { accommodationFor, accommodationSummary, photosFor } from '../lib/accommodations.js';
import { reasonText } from '../lib/advice.js';
import { formatEuros, formatPercent, formatWeekend, nights } from '../lib/format.js';
import { providerName, trackedBookingUrl } from '../lib/providers.js';
import AdviceBadge from './AdviceBadge.vue';
import BrandBadge from './BrandBadge.vue';
import GoogleRating from './GoogleRating.vue';
import Icon from './Icon.vue';
import PopularBadge from './PopularBadge.vue';
import WeekendTags from './WeekendTags.vue';
import ParkLocation from './ParkLocation.vue';
import PhotoCarousel from './PhotoCarousel.vue';

const props = defineProps({
  deal: { type: Object, required: true },
  // The travel party and accommodation requirements, for the booking link.
  settings: { type: Object, required: true },
  // The party size the listed prices are for; the park panel gives the exact party's price.
  pricedFor: { type: Object, default: null },
  // What makes this weekend special, see shared/occasions.mjs.
  occasions: { type: Array, default: () => [] },
  // Visitors clicked through to this park often this week.
  popular: { type: Boolean, default: false },
});
const emit = defineEmits(['open']);

const park = computed(() => props.deal.park);
const weekend = computed(() => props.deal.weekend);
const provider = computed(() => providerName(park.value.provider));
const bookUrl = computed(() => trackedBookingUrl(park.value, weekend.value, props.settings, 'kaartje'));
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
// Why booking now pays off, from what was measured (filling up, rising, lowest yet): the reason to click.
const bookReason = computed(() =>
  weekend.value.advice?.verdict === 'book' ? reasonText(weekend.value.advice.reasons[0] ?? {}) : '',
);
const photos = computed(() => photosFor(park.value, weekend.value));
const accommodation = computed(() => accommodationSummary(accommodationFor(park.value, weekend.value)));
</script>

<template>
  <!-- The whole card opens the park; the location, rating and booking links sit above that click area. -->
  <article
    class="group relative flex flex-col overflow-hidden rounded-3xl bg-surface ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-field has-[h3_button:focus-visible]:ring-2 has-[h3_button:focus-visible]:ring-accent"
  >
    <!-- Above the card's click area so the photos can be swiped; a click still opens the park. -->
    <div class="relative z-10 aspect-[3/2] cursor-pointer overflow-hidden bg-line" @click="emit('open')">
      <PhotoCarousel :photos="photos" />
      <span
        v-if="belowNormal"
        class="absolute top-3 left-3 inline-flex -rotate-3 items-center gap-1 rounded-full bg-sun px-3 py-1 text-sm font-black text-on-sun shadow-md"
      >
        <Icon name="arrowDown" class="size-3.5" />
        {{ formatPercent(weekend.discount) }} voordeliger
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
      <p class="flex flex-wrap items-center gap-2">
        <BrandBadge :brand="park.brand" />
        <PopularBadge v-if="popular" />
      </p>
      <h3 class="mt-0.5 text-lg leading-snug font-extrabold">
        <button type="button" class="text-left after:absolute after:inset-0 focus-visible:outline-none" @click="emit('open')">
          {{ park.name }}
        </button>
      </h3>
      <ParkLocation :park="park" class="relative z-10 self-start" />
      <GoogleRating :rating="park.googleRating" as-button class="relative z-10 self-start" @select="emit('open', { reviews: true })" />
      <p class="mt-1 flex items-center gap-1.5 text-sm font-medium">
        <Icon name="calendar" class="size-4 text-ink-secondary" />
        {{ formatWeekend(weekend) }}
        <span v-if="otherWeekends" class="font-normal text-ink-secondary">
          · +{{ otherWeekends }} {{ otherWeekends === 1 ? 'weekend' : 'weekenden' }}
        </span>
      </p>
      <WeekendTags :weather="weekend.weather" :occasions="occasions" />
      <p v-if="accommodation" class="flex min-w-0 items-center gap-1.5 text-sm text-ink-secondary" :title="accommodation">
        <Icon name="home" class="size-4" />
        <span class="truncate">{{ accommodation }}</span>
      </p>

      <div class="mt-auto pt-3">
        <div>
          <p v-if="belowNormal" class="text-sm text-ink-muted tabular-nums">
            <span class="sr-only">Normaal </span><span class="line-through">{{ formatEuros(park.baselineCents) }}</span>
          </p>
          <p v-else-if="park.baselineCents" class="text-sm text-ink-muted tabular-nums">
            normaal {{ formatEuros(park.baselineCents) }}
          </p>
          <p class="text-3xl leading-tight font-black tabular-nums"><span class="sr-only">Nu </span>{{ formatEuros(weekend.priceCents) }}</p>
          <p class="text-xs text-ink-secondary">{{ stay }}</p>
          <p v-if="belowNormal" class="mt-1 text-sm font-medium text-good-ink">{{ saving }} onder normaal</p>
        </div>
        <a
          :href="bookUrl"
          target="_blank"
          rel="sponsored noopener"
          class="relative z-10 mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-cta font-extrabold text-on-cta shadow-sm transition hover:bg-cta-hover hover:shadow-md px-4 py-2.5"
        >
          Boek bij {{ provider }}
          <Icon name="external" class="size-4" />
          <span class="sr-only">(opent {{ provider }} in een nieuw tabblad)</span>
        </a>
        <p v-if="bookReason" class="mt-2 flex items-start gap-1.5 text-xs text-good-ink">
          <Icon name="bolt" class="mt-px size-3.5 shrink-0" />
          {{ bookReason }}
        </p>
      </div>
    </div>
  </article>
</template>
