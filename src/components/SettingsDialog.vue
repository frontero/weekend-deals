<script setup>
import { reactive, ref, watch } from 'vue';
import { ROUND_SCHEDULES } from '../../shared/schedule.mjs';
import Icon from './Icon.vue';
import NumberStepper from './NumberStepper.vue';

const open = defineModel('open', { type: Boolean, required: true });
const props = defineProps({
  settings: { type: Object, required: true },
  accommodationGroups: { type: Array, required: true },
  // How far ahead and how often apply to everyone, so only admins change them.
  admin: { type: Boolean, default: false },
});
const emit = defineEmits(['save']);

const ROUND_OPTIONS = Object.entries(ROUND_SCHEDULES).map(([value, { label }]) => ({ value, label }));

const dialog = ref(null);
// The checkboxes edit the feature list in place, so the draft needs its own copy.
const copySettings = (settings) => ({ ...settings, accommodationFeatures: [...settings.accommodationFeatures] });
const draft = reactive(copySettings(props.settings));

watch(open, (isOpen) => {
  if (isOpen) {
    Object.assign(draft, copySettings(props.settings));
    dialog.value.showModal();
  } else if (dialog.value?.open) {
    dialog.value.close();
  }
});

function save() {
  emit('save', copySettings(draft));
  open.value = false;
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto max-h-[90dvh] w-[min(44rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl bg-surface p-0 text-ink shadow-2xl"
    aria-labelledby="settings-title"
    @close="open = false"
  >
    <form class="flex max-h-[90dvh] flex-col" @submit.prevent="save">
      <header class="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id="settings-title" class="text-lg font-semibold">Gezelschap en huisje</h2>
        <button type="button" class="rounded-full p-2 hover:bg-hover" aria-label="Sluiten" @click="open = false">
          <Icon name="x" class="size-5" />
        </button>
      </header>

      <div class="flex-1 overflow-y-auto px-5">
        <section class="divide-y divide-line border-b border-line py-2">
          <NumberStepper v-model="draft.adults" label="Volwassenen" hint="18 jaar en ouder" :min="1" :max="12" />
          <NumberStepper v-model="draft.children" label="Kinderen" hint="3 tot 18 jaar" :min="0" :max="10" />
          <NumberStepper
            v-model="draft.pets"
            label="Huisdieren"
            hint="Alleen huisjes waar ze mogen, toeslag inbegrepen"
            :min="0"
            :max="3"
          />
        </section>

        <section class="border-b border-line py-5">
          <h3 class="font-semibold">Eisen aan het huisje</h3>
          <p class="mt-0.5 text-sm text-ink-secondary">
            De prijs wordt die van het goedkoopste huisje dat aan alles voldoet. Bij "één van" is één optie genoeg.
          </p>
          <p v-if="!accommodationGroups.length" class="mt-3 text-sm text-ink-secondary">De kenmerken worden opgehaald…</p>
          <div v-else class="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <fieldset v-for="group in accommodationGroups" :key="group.name">
              <legend class="mb-1.5 text-sm font-semibold">
                {{ group.name }}
                <span v-if="group.anyOf" class="font-normal text-ink-muted">(één van)</span>
              </legend>
              <div class="flex flex-wrap gap-1.5">
                <label
                  v-for="option in group.options"
                  :key="option.id"
                  class="cursor-pointer rounded-full px-3 py-1 text-sm ring-1 ring-line transition select-none hover:ring-field has-checked:bg-accent-wash has-checked:font-medium has-checked:ring-accent has-focus-visible:outline-2 has-focus-visible:outline-accent"
                >
                  <input v-model="draft.accommodationFeatures" type="checkbox" :value="option.id" class="sr-only" />
                  {{ option.name }}
                </label>
              </div>
            </fieldset>
          </div>
        </section>

        <section v-if="admin" class="grid gap-4 py-5 sm:grid-cols-2">
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-semibold">Weken vooruit kijken</span>
            <select v-model.number="draft.weeksAhead" class="rounded-lg bg-plane px-3 py-2 ring-1 ring-field">
              <option v-for="weeks in [8, 12, 16, 20, 26]" :key="weeks" :value="weeks">{{ weeks }} weken</option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-semibold">Prijzen verversen</span>
            <select v-model="draft.rounds" class="rounded-lg bg-plane px-3 py-2 ring-1 ring-field">
              <option v-for="option in ROUND_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
        </section>
      </div>

      <footer class="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
        <p class="min-w-0 basis-full text-xs text-ink-secondary sm:basis-0 sm:flex-1">
          De lijst toont de prijzen voor 2, 3, 4, 5, 6, 8, 10 of 12 personen, de kleinste groep waar jullie in passen. Open een
          park voor je exacte prijs, met kinderen, huisdieren en eisen. Dit gezelschap geldt alleen in deze browser.
        </p>
        <button type="button" class="ml-auto rounded-lg px-4 py-2 font-medium hover:bg-hover sm:ml-0" @click="open = false">
          Annuleren
        </button>
        <button type="submit" class="rounded-full bg-accent px-4 py-2 font-medium text-on-accent hover:bg-accent-hover">
          Opslaan
        </button>
      </footer>
    </form>
  </dialog>
</template>
