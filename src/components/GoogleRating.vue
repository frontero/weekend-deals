<script setup>
import { computed, useId } from 'vue';
import { starFills } from '../lib/rating.js';

const props = defineProps({
  // { rating, ratingCount, mapsUrl } or null
  rating: { type: Object, default: null },
  // A button that shows the reviews here, instead of a link to Google Maps.
  asButton: { type: Boolean, default: false },
});
const emit = defineEmits(['select']);

const STAR = 'M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z';
const id = useId();

const stars = computed(() =>
  starFills(props.rating?.rating ?? 0).map((fill, index) => ({ clipId: `${id}-star-${index}`, width: fill * 20 })),
);
const score = computed(() =>
  props.rating?.rating?.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
);
const count = computed(() => props.rating?.ratingCount?.toLocaleString('nl-NL'));
</script>

<template>
  <component
    :is="asButton ? 'button' : 'a'"
    v-if="rating"
    v-bind="asButton ? { type: 'button' } : { href: rating.mapsUrl, target: '_blank', rel: 'noopener' }"
    class="inline-flex items-center gap-1.5 text-sm hover:underline"
    :aria-label="`Google-score ${score} van 5, ${count} reviews${asButton ? ', recensies tonen' : ''}`"
    @click.stop="emit('select')"
  >
    <span class="font-semibold">{{ score }}</span>
    <span class="flex" aria-hidden="true">
      <svg v-for="star in stars" :key="star.clipId" viewBox="0 0 20 20" class="size-4">
        <clipPath :id="star.clipId"><rect :width="star.width" height="20" /></clipPath>
        <path :d="STAR" class="fill-line" />
        <path :d="STAR" class="fill-star" :clip-path="`url(#${star.clipId})`" />
      </svg>
    </span>
    <span class="text-ink-secondary">({{ count }}) · Google</span>
  </component>
</template>
