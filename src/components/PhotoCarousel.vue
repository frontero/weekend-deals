<script setup>
import { ref, watch } from 'vue';
import Icon from './Icon.vue';

/**
 * Photos to swipe through, step through with the arrows that show on hover, or with the arrow keys.
 * Only the first photo loads with the page: a strip scrolls sideways, so the browser's lazy loading would fetch
 * every photo of every card. The others load once someone points at, touches or focuses the strip.
 */
const props = defineProps({
  // Photo URLs
  photos: { type: Array, required: true },
});

const track = ref(null);
const index = ref(0);
const awake = ref(false);
const wake = () => {
  awake.value = true;
};

function onScroll() {
  index.value = Math.round(track.value.scrollLeft / track.value.clientWidth);
}

function go(step) {
  const next = Math.min(Math.max(index.value + step, 0), props.photos.length - 1);
  track.value.scrollTo({ left: next * track.value.clientWidth, behavior: 'smooth' });
}

// Another weekend can mean another accommodation: start at its first photo.
watch(
  () => props.photos,
  () => {
    index.value = 0;
    if (track.value) track.value.scrollLeft = 0;
  },
);

const arrowClass =
  'absolute top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-surface/90 text-ink shadow transition hover:bg-hover disabled:invisible opacity-0 group-hover/photos:opacity-100 group-focus-within/photos:opacity-100';
</script>

<template>
  <div
    class="group/photos relative size-full"
    @pointerenter.once="wake"
    @touchstart.once.passive="wake"
    @focusin.once="wake"
  >
    <!-- With more than one photo the strip itself takes keyboard focus and steps with the arrow keys. -->
    <div
      ref="track"
      class="flex size-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] focus-visible:-outline-offset-4"
      :tabindex="photos.length > 1 ? 0 : undefined"
      :role="photos.length > 1 ? 'group' : undefined"
      :aria-label="photos.length > 1 ? `${photos.length} foto's, blader met de pijltjestoetsen` : undefined"
      @scroll.passive="onScroll"
      @keydown.right.prevent="go(1)"
      @keydown.left.prevent="go(-1)"
    >
      <img
        v-for="(photo, position) in photos"
        :key="photo"
        :src="position === 0 || awake ? photo : undefined"
        alt=""
        loading="lazy"
        draggable="false"
        class="size-full shrink-0 snap-start object-cover"
      />
    </div>

    <template v-if="photos.length > 1">
      <!-- For the pointer; the keyboard uses the strip's arrow keys instead of two more tab stops per card. -->
      <button
        type="button"
        tabindex="-1"
        :class="[arrowClass, 'left-2']"
        aria-label="Vorige foto"
        :disabled="index === 0"
        @click.stop="go(-1)"
      >
        <Icon name="chevronLeft" class="size-4" />
      </button>
      <button
        type="button"
        tabindex="-1"
        :class="[arrowClass, 'right-2']"
        aria-label="Volgende foto"
        :disabled="index === photos.length - 1"
        @click.stop="go(1)"
      >
        <Icon name="chevronRight" class="size-4" />
      </button>
      <div class="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1" aria-hidden="true">
        <span
          v-for="(photo, position) in photos"
          :key="photo"
          class="size-1.5 rounded-full shadow-[0_0_2px_rgb(0_0_0/0.6)] transition"
          :class="position === index ? 'bg-white' : 'bg-white/55'"
        />
      </div>
      <p class="sr-only" aria-live="polite">Foto {{ index + 1 }} van {{ photos.length }}</p>
    </template>
  </div>
</template>
