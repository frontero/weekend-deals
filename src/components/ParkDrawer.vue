<script setup>
import { computed, ref, watch } from 'vue';
import { partyLabel } from '../../shared/party.mjs';
import { useQuote } from '../composables/useQuote.js';
import { accommodationFor, accommodationSummary, photosFor } from '../lib/accommodations.js';
import { bestWeekend } from '../lib/deals.js';
import { formatEuros, formatPercent, formatShortDate, formatWeekend, nights } from '../lib/format.js';
import { priceInsight } from '../lib/insights.js';
import { bookingUrl, providerName } from '../lib/providers.js';
import { describePartyShort } from '../lib/stay.js';
import AdvicePanel from './AdvicePanel.vue';
import BrandBadge from './BrandBadge.vue';
import GoogleRating from './GoogleRating.vue';
import Icon from './Icon.vue';
import ParkLocation from './ParkLocation.vue';
import PhotoCarousel from './PhotoCarousel.vue';
import PriceColumns from './PriceColumns.vue';
import PriceInsight from './PriceInsight.vue';

const props = defineProps({
  // The park with all its weekends, or null when closed.
  park: { type: Object, default: null },
  // Arrival date of the weekend to show first; falls back to the park's best weekend.
  arrival: { type: String, default: '' },
  minDiscount: { type: Number, required: true },
  facilityGroups: { type: Array, required: true },
  // The travel party and accommodation requirements: their exact price is asked live, and goes in the booking link.
  settings: { type: Object, required: true },
  // The party size the listed prices are for.
  pricedFor: { type: Object, default: null },
  // Group key of the party whose prices are shown, for the price history.
  partyKey: { type: String, default: '' },
});
const emit = defineEmits(['close']);

const dialog = ref(null);
const focusArrival = ref('');

watch(
  () => props.park,
  (park) => {
    if (park) {
      focusArrival.value = props.arrival || bestWeekend(park).arrival;
      if (!dialog.value.open) dialog.value.showModal();
    } else if (dialog.value?.open) {
      dialog.value.close();
    }
  },
);

function describe(weekend) {
  if (weekend.discount === null) return '';
  if (Math.round(weekend.discount * 100) === 0) return 'normale prijs';
  const share = formatPercent(Math.abs(weekend.discount));
  return weekend.discount >= 0 ? `${share} onder normaal` : `${share} boven normaal`;
}

const focus = computed(() => props.park?.weekends.find((weekend) => weekend.arrival === focusArrival.value) ?? null);
// The exact party's price for the chosen weekend, asked live; the list's price is for a party size.
const live = useQuote(() => (props.park && focus.value ? { park: props.park, weekend: focus.value, party: props.settings } : null));
const quote = computed(() => (live.value.state === 'done' ? live.value.quote : null));
const party = computed(() => describePartyShort(props.settings));
// The park as the live quote sees it: its accommodation is the one the exact party would get.
const quotedPark = computed(() =>
  quote.value?.accommodation
    ? { ...props.park, accommodations: { ...props.park.accommodations, [quote.value.accommodationCode]: quote.value.accommodation } }
    : props.park,
);
const quotedWeekend = computed(() =>
  quote.value ? { ...focus.value, accommodationCode: quote.value.accommodationCode, bookingUrl: quote.value.bookingUrl } : focus.value,
);
// The accommodation behind the shown price, with all its facts.
const photos = computed(() => photosFor(quotedPark.value, quotedWeekend.value));
const accommodation = computed(() => accommodationSummary(accommodationFor(quotedPark.value, quotedWeekend.value), Infinity));
const insight = computed(() => (props.park && focus.value ? priceInsight(props.park, focus.value) : null));
const saving = computed(() =>
  props.park?.baselineCents && focus.value ? props.park.baselineCents - focus.value.priceCents : 0,
);
const provider = computed(() => providerName(props.park?.provider));
const bookUrl = computed(() => (focus.value ? bookingUrl(quotedPark.value, quotedWeekend.value, props.settings) : ''));

const rows = computed(() =>
  (props.park?.weekends ?? []).map((weekend) => ({
    ...weekend,
    isDeal: weekend.discount !== null && weekend.discount >= props.minDiscount,
    description: describe(weekend),
  })),
);
const columns = computed(() =>
  rows.value.map((row) => ({
    key: row.arrival,
    tick: formatShortDate(row.arrival),
    title: formatWeekend(row),
    valueCents: row.priceCents,
    highlight: row.isDeal,
    label: row.isDeal ? `−${formatPercent(row.discount)}` : '',
    note: row.description,
  })),
);
const parkFacilities = computed(() =>
  props.facilityGroups
    .map((group) => ({
      name: group.name,
      names: group.options
        .filter((option) => props.park?.facilities.includes(option.id))
        .map((option) => option.name)
        .join(' · '),
    }))
    .filter((group) => group.names),
);
const referenceLabel = computed(() => `normaal ${formatEuros(props.park?.baselineCents ?? 0)}`);
</script>

<template>
  <dialog
    ref="dialog"
    class="m-0 ml-auto h-dvh max-h-dvh w-full max-w-xl overflow-y-auto bg-surface p-0 text-ink shadow-2xl"
    aria-labelledby="park-title"
    @close="emit('close')"
  >
    <template v-if="park">
      <div class="relative h-56 bg-line">
        <PhotoCarousel :photos="photos" />
        <button
          type="button"
          class="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-surface/95 shadow hover:bg-hover"
          aria-label="Sluiten"
          @click="dialog.close()"
        >
          <Icon name="x" class="size-5" />
        </button>
      </div>

      <div class="flex flex-col gap-6 p-5">
        <header class="flex flex-col items-start gap-1">
          <BrandBadge :brand="park.brand" />
          <h2 id="park-title" class="text-xl font-semibold">{{ park.name }}</h2>
          <ParkLocation :park="park" />
          <GoogleRating :rating="park.googleRating" />
        </header>

        <section v-if="focus" class="rounded-2xl p-4 ring-1 ring-line" aria-label="Gekozen weekend">
          <p class="flex items-center gap-1.5 text-sm font-medium">
            <Icon name="calendar" class="size-4 text-ink-secondary" />
            {{ formatWeekend(focus) }} · {{ nights(focus) }} nachten
          </p>
          <p v-if="accommodation" class="mt-1 flex items-center gap-1.5 text-sm text-ink-secondary">
            <Icon name="home" class="size-4" />
            {{ accommodation }}
          </p>
          <div class="mt-2 flex flex-wrap items-baseline gap-x-3">
            <span class="text-3xl font-bold tabular-nums">{{ formatEuros(focus.priceCents) }}</span>
            <span v-if="pricedFor" class="text-sm text-ink-secondary">voor {{ partyLabel(pricedFor) }}</span>
            <span v-if="park.baselineCents" class="text-sm text-ink-muted tabular-nums">
              normaal <span class="line-through">{{ formatEuros(park.baselineCents) }}</span>
            </span>
            <span v-if="saving > 0" class="text-sm font-medium text-good-ink">{{ formatEuros(saving) }} onder normaal</span>
          </div>
          <!-- The exact party's price, asked from the provider when the park opens. -->
          <div class="mt-3 rounded-xl bg-plane px-3 py-2.5 text-sm" aria-live="polite">
            <p v-if="live.state === 'loading'" class="flex items-center gap-2 text-ink-secondary">
              <Icon name="refresh" class="size-4 animate-spin [animation-direction:reverse]" />
              Je prijs voor {{ party }} opvragen bij {{ provider }}…
            </p>
            <template v-else-if="live.state === 'done' && quote">
              <p>
                <span class="font-semibold tabular-nums">Jouw prijs: {{ formatEuros(quote.priceCents) }}</span>
                voor {{ party }}<template v-if="settings.accommodationFeatures.length && !live.ignoresFeatures"> met je huisjeseisen</template>
              </p>
              <p class="text-xs text-ink-secondary">Zojuist opgevraagd bij {{ provider }}.</p>
              <p v-if="live.ignoresFeatures" class="mt-1 text-xs text-ink-secondary">
                {{ provider }} kent je huisjeseisen niet; dit is de prijs zonder die eisen.
              </p>
            </template>
            <p v-else-if="live.state === 'done'" class="text-warning-ink">
              Bij {{ provider }} is dit weekend niets meer vrij voor {{ party }}.
            </p>
            <p v-else-if="live.state === 'failed'" class="text-ink-secondary">
              Je eigen prijs opvragen lukte niet. De prijs hierboven geldt voor {{ pricedFor ? partyLabel(pricedFor) : 'een ander gezelschap' }}.
            </p>
          </div>
          <PriceInsight v-if="insight" :insight="insight" :price-cents="focus.priceCents" class="mt-4" />
          <a
            :href="bookUrl"
            target="_blank"
            rel="noopener"
            class="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 font-semibold text-on-accent hover:bg-accent-hover"
          >
            Bekijk dit weekend op {{ provider }}
            <Icon name="external" class="size-4" />
          </a>
          <p class="mt-2 text-center text-xs text-ink-muted">
            Totaalprijs incl. toeslagen. De link neemt je datums en je gezelschap mee.
          </p>
        </section>

        <AdvicePanel v-if="focus?.advice" :park-code="park.code" :party-key="partyKey" :weekend="focus" />

        <section>
          <h3 class="font-semibold">Alle weekenden</h3>
          <p class="mb-3 text-sm text-ink-secondary">Kies een weekend om het hierboven te bekijken.</p>
          <PriceColumns
            :columns="columns"
            :caption="`Weekendprijzen ${park.name}`"
            :reference-cents="park.baselineCents"
            :reference-label="referenceLabel"
            :selected-key="focusArrival"
            @select="focusArrival = $event.key"
          />
          <ul class="mt-4 divide-y divide-line text-sm">
            <li v-for="row in rows" :key="row.arrival">
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover"
                :class="row.arrival === focusArrival ? 'bg-accent-wash hover:bg-accent-wash' : ''"
                :aria-pressed="row.arrival === focusArrival"
                @click="focusArrival = row.arrival"
              >
                <span class="flex-1">{{ formatWeekend(row) }}</span>
                <span class="hidden sm:block" :class="row.isDeal ? 'font-medium text-good-ink' : 'text-ink-secondary'">
                  {{ row.description }}
                </span>
                <span class="w-16 text-right font-semibold tabular-nums">{{ formatEuros(row.priceCents) }}</span>
              </button>
            </li>
          </ul>
        </section>

        <section v-if="parkFacilities.length">
          <h3 class="mb-2 font-semibold">Faciliteiten</h3>
          <dl class="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <template v-for="group in parkFacilities" :key="group.name">
              <dt class="font-medium">{{ group.name }}</dt>
              <dd class="mb-1 text-ink-secondary sm:mb-0">{{ group.names }}</dd>
            </template>
          </dl>
        </section>
      </div>
    </template>
  </dialog>
</template>
