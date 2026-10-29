<script setup>
import { computed } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  failed: { type: Boolean, required: true },
  scan: { type: Object, default: null },
  google: { type: Object, default: null },
  // [{ id, name, error }]
  providers: { type: Array, default: () => [] },
  // The party size the list shows has no prices yet: only right after a size was added.
  partyPending: { type: Boolean, default: false },
  // What went wrong behind the scenes is for the admin; visitors see the last prices that did come in.
  admin: { type: Boolean, default: false },
});

const notices = computed(() => {
  const list = [];
  if (props.failed) {
    list.push({ tone: 'warning', text: 'De prijzen zijn nu niet bereikbaar. Probeer het zo opnieuw.' });
  }
  if (props.partyPending) {
    list.push({
      tone: 'info',
      text: 'De prijzen voor deze groepsgrootte worden voor het eerst opgehaald. Open een park voor je prijs van dit moment.',
    });
  }
  if (!props.admin) return list;
  const scanError = props.scan?.running ? null : (props.scan?.error ?? props.scan?.lastScan?.error);
  if (scanError) list.push({ tone: 'warning', text: `Laatste ophaalronde mislukt: ${scanError}` });
  for (const provider of props.providers.filter((item) => item.error)) {
    list.push({ tone: 'warning', text: `${provider.name} kon de laatste ronde niet worden opgehaald: ${provider.error}` });
  }
  if (props.google && !props.google.enabled) {
    list.push({
      tone: 'info',
      text: 'Google-scores staan uit. Draai scripts/setup-google-key.sh om een sleutel toe te voegen.',
    });
  } else if (props.google?.error) {
    list.push({ tone: 'warning', text: `Google-scores ophalen mislukt: ${props.google.error}` });
  }
  return list;
});

const TONES = {
  warning: { icon: 'warning', classes: 'bg-warning-wash text-warning-ink' },
  info: { icon: 'info', classes: 'bg-surface text-ink-secondary ring-1 ring-line' },
};
</script>

<template>
  <div v-if="notices.length" class="flex flex-col gap-2">
    <p
      v-for="notice in notices"
      :key="notice.text"
      class="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
      :class="TONES[notice.tone].classes"
      role="status"
    >
      <Icon :name="TONES[notice.tone].icon" class="mt-px size-4" />
      {{ notice.text }}
    </p>
  </div>
</template>
