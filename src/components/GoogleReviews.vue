<script setup>
import { computed, ref, watch } from 'vue';
import { request } from '../lib/api.js';
import Icon from './Icon.vue';

// A park's Google reviews, asked for when someone opens them: Google gives at most five, by relevance, and does not
// allow keeping them. Each shows its author and links to the review on Google Maps, as Google requires.
const props = defineProps({
  parkCode: { type: String, required: true },
  // The park on Google Maps, for all its reviews.
  mapsUrl: { type: String, default: '' },
});

const PAGE_SIZE = 2;
const LANGUAGES = { de: 'het Duits', en: 'het Engels', fr: 'het Frans', da: 'het Deens', it: 'het Italiaans', es: 'het Spaans' };
const visitMonth = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' });

// closed, loading, ready, failed or limited (this month's budget is used)
const state = ref('closed');
const reviews = ref([]);
const page = ref(0);
const section = ref(null);

watch(
  () => props.parkCode,
  () => {
    state.value = 'closed';
    reviews.value = [];
    page.value = 0;
  },
);

async function open() {
  section.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (state.value !== 'closed' && state.value !== 'failed') return;
  state.value = 'loading';
  try {
    const response = await fetch(`/api/reviews?park=${encodeURIComponent(props.parkCode)}`);
    if (response.status === 429) {
      state.value = 'limited';
      return;
    }
    if (!response.ok) throw new Error(`Reviews failed with ${response.status}`);
    reviews.value = (await response.json()).reviews;
    state.value = 'ready';
  } catch {
    state.value = 'failed';
  }
}
defineExpose({ open });

const pages = computed(() => Math.ceil(reviews.value.length / PAGE_SIZE));
const shown = computed(() =>
  reviews.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE).map((review) => ({
    ...review,
    stars: review.rating ? '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating) : '',
    visit: review.visited ? `bezocht in ${visitMonth.format(new Date(review.visited.year, (review.visited.month ?? 1) - 1))}` : '',
    translation: review.translatedFrom ? `Vertaald uit ${LANGUAGES[review.translatedFrom] ?? review.translatedFrom}` : '',
  })),
);
const range = computed(() => `${page.value * PAGE_SIZE + 1}–${Math.min((page.value + 1) * PAGE_SIZE, reviews.value.length)} van ${reviews.value.length}`);
</script>

<template>
  <section ref="section" class="scroll-mt-4" aria-labelledby="reviews-title">
    <div class="flex items-center justify-between gap-3">
      <h3 id="reviews-title" class="font-semibold">Recensies</h3>
      <span class="text-xs text-ink-muted">Google Maps</span>
    </div>

    <button
      v-if="state === 'closed'"
      type="button"
      class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium ring-1 ring-line hover:bg-hover"
      @click="open"
    >
      Recensies van Google lezen
    </button>
    <p v-else-if="state === 'loading'" class="mt-2 text-sm text-ink-secondary" role="status">Recensies ophalen bij Google…</p>
    <p v-else-if="state === 'limited'" class="mt-2 text-sm text-ink-secondary" role="status">
      Het maandbudget voor recensies is op. Lees ze op Google Maps.
    </p>
    <p v-else-if="state === 'failed'" class="mt-2 text-sm text-ink-secondary" role="status">
      De recensies konden niet worden opgehaald.
    </p>
    <template v-else>
      <p v-if="!reviews.length" class="mt-2 text-sm text-ink-secondary">Google heeft geen recensies voor dit park.</p>
      <ul v-else class="mt-2 flex flex-col gap-3" aria-live="polite">
        <li v-for="review in shown" :key="review.url ?? review.author" class="rounded-xl bg-plane p-3 text-sm">
          <div class="flex items-center gap-2.5">
            <img v-if="review.photoUrl" :src="review.photoUrl" alt="" class="size-8 rounded-full" referrerpolicy="no-referrer" loading="lazy" />
            <div class="min-w-0 flex-1">
              <a v-if="review.authorUrl" :href="review.authorUrl" target="_blank" rel="noopener" class="font-medium hover:underline">
                {{ review.author }}
              </a>
              <span v-else class="font-medium">{{ review.author }}</span>
              <p class="text-xs text-ink-secondary">
                <span class="text-star" :aria-label="`${review.rating} van 5 sterren`">{{ review.stars }}</span>
                {{ review.when }}<template v-if="review.visit"> · {{ review.visit }}</template>
              </p>
            </div>
          </div>
          <p class="mt-2 whitespace-pre-line">{{ review.text }}</p>
          <p class="mt-2 flex flex-wrap gap-x-3 text-xs text-ink-muted">
            <span v-if="review.translation">{{ review.translation }} door Google</span>
            <a v-if="review.url" :href="review.url" target="_blank" rel="noopener" class="font-medium text-accent hover:underline">
              Bekijk op Google Maps<span class="sr-only"> (opent in een nieuw tabblad)</span>
            </a>
          </p>
        </li>
      </ul>
      <div v-if="pages > 1" class="mt-3 flex items-center justify-between text-sm">
        <button type="button" class="rounded-lg px-3 py-1.5 font-medium ring-1 ring-line hover:bg-hover disabled:opacity-40" :disabled="page === 0" @click="page -= 1">
          Vorige
        </button>
        <span class="text-ink-secondary tabular-nums">{{ range }}</span>
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 font-medium ring-1 ring-line hover:bg-hover disabled:opacity-40"
          :disabled="page >= pages - 1"
          @click="page += 1"
        >
          Volgende
        </button>
      </div>
      <p v-if="reviews.length" class="mt-2 text-xs text-ink-muted">Google kiest er hooguit vijf, gesorteerd op relevantie.</p>
    </template>

    <a
      v-if="mapsUrl"
      :href="mapsUrl"
      target="_blank"
      rel="noopener"
      class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
    >
      Alle recensies op Google Maps
      <Icon name="external" class="size-4" />
      <span class="sr-only">(opent in een nieuw tabblad)</span>
    </a>
  </section>
</template>
