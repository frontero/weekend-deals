<script setup>
import { computed, ref, watch } from 'vue';
import { groupKey, partyLabel, seriesFor } from '../../shared/party.mjs';
import { isTopic, useAlerts } from '../composables/useAlerts.js';
import { formatShortDate } from '../lib/format.js';
import { describeTravelParty } from '../lib/stay.js';
import Icon from './Icon.vue';

/** Price alerts on the current search, sent to a phone through the free ntfy app. */
const open = defineModel('open', { type: Boolean, required: true });
const props = defineProps({
  // The alert this search would set: { party, search, query, label, seen, primed }, see POST /api/alerts.
  draft: { type: Object, required: true },
});

const NTFY_PHONE_DOCS = 'https://docs.ntfy.sh/subscribe/phone/';

const { topic, alerts, load, create, remove, test, useTopic } = useAlerts();
const dialog = ref(null);
const creating = ref(false);
const createError = ref('');
const copied = ref(false);
const testState = ref('idle');
const otherTopic = ref('');
const topicError = ref('');

watch(open, (isOpen) => {
  if (isOpen) {
    createError.value = '';
    testState.value = 'idle';
    load().catch(() => {
      createError.value = 'Je alarmen konden niet worden geladen.';
    });
    dialog.value.showModal();
  } else if (dialog.value?.open) {
    dialog.value.close();
  }
});

// An alert watches the list's prices: those of the party's size.
const draftKey = computed(() => groupKey(seriesFor(props.draft.party)));
const exists = computed(() =>
  alerts.value.some((alert) => alert.label === props.draft.label && alert.partyKey === draftKey.value),
);
const draftParty = computed(
  () => `${describeTravelParty(props.draft.party)} · let op de prijzen voor ${partyLabel(seriesFor(props.draft.party))}`,
);
const draftNote = computed(() => {
  if (!props.draft.primed) return 'De prijzen voor deze groepsgrootte komen nog binnen; wat er dan bij past, geldt als beginpunt.';
  const count = props.draft.seen.length;
  return count ? `Nu ${count} ${count === 1 ? 'kansje' : 'kansjes'}; die zie je al, dus daar krijg je geen melding van.` : 'Nu nog geen kansjes.';
});
const testText = computed(
  () =>
    ({
      sending: 'Versturen…',
      sent: 'Verstuurd. Geen melding binnen een minuut? Controleer het onderwerp in ntfy.',
      failed: 'Versturen lukte niet. Probeer het zo nog eens.',
    })[testState.value] ?? '',
);
const listed = computed(() =>
  alerts.value.map((alert) => ({
    ...alert,
    detail: [alert.party ? partyLabel(alert.party) : null, `sinds ${formatShortDate(alert.createdAt.slice(0, 10))}`]
      .filter(Boolean)
      .join(' · '),
  })),
);

async function setAlert() {
  creating.value = true;
  createError.value = '';
  try {
    await create(props.draft);
  } catch {
    createError.value = 'Het alarm kon niet worden bewaard. Probeer het zo nog eens.';
  } finally {
    creating.value = false;
  }
}

async function copyTopic() {
  await navigator.clipboard.writeText(topic.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

async function sendTest() {
  testState.value = 'sending';
  try {
    await test();
    testState.value = 'sent';
  } catch {
    testState.value = 'failed';
  }
}

async function switchTopic() {
  topicError.value = '';
  if (!isTopic(otherTopic.value.trim())) {
    topicError.value = 'Een onderwerp is 16 tot 64 letters, cijfers, - of _.';
    return;
  }
  await useTopic(otherTopic.value);
  otherTopic.value = '';
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto max-h-[90dvh] w-[min(40rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl bg-surface p-0 text-ink shadow-2xl"
    aria-labelledby="alerts-title"
    @close="open = false"
  >
    <div class="flex max-h-[90dvh] flex-col">
      <header class="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id="alerts-title" class="text-lg font-semibold">Prijsalarm</h2>
        <button type="button" class="rounded-full p-2 hover:bg-hover" aria-label="Sluiten" @click="open = false">
          <Icon name="x" class="size-5" />
        </button>
      </header>

      <div class="flex-1 divide-y divide-line overflow-y-auto px-5">
        <section class="py-5" aria-labelledby="alert-new-title">
          <h3 id="alert-new-title" class="font-semibold">Alarm op deze zoekopdracht</h3>
          <p class="mt-0.5 text-sm text-ink-secondary">
            Na elke ophaalronde kijkt de app of er een nieuw buitenkansje bij komt, of een gemeld kansje duidelijk goedkoper
            wordt. Dan krijg je een melding op je telefoon.
          </p>
          <div class="mt-3 rounded-xl bg-plane p-3 text-sm">
            <p class="font-medium">{{ draft.label }}</p>
            <p class="text-ink-secondary">{{ draftParty }}</p>
            <p class="mt-1 text-xs text-ink-secondary">{{ draftNote }}</p>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
              :disabled="exists || creating"
              @click="setAlert"
            >
              <Icon name="bell" class="size-4" />
              Alarm aanzetten
            </button>
            <p v-if="exists" class="text-sm text-ink-secondary">Dit alarm staat al aan.</p>
            <p v-if="createError" class="text-sm text-warning-ink" role="alert">{{ createError }}</p>
          </div>
        </section>

        <section class="py-5" aria-labelledby="alert-phone-title">
          <h3 id="alert-phone-title" class="font-semibold">Je telefoon koppelen</h3>
          <ol class="mt-2 flex list-decimal flex-col gap-3 pl-5 text-sm">
            <li>
              Installeer de gratis app
              <a :href="NTFY_PHONE_DOCS" target="_blank" rel="noopener" class="font-medium text-accent underline">ntfy</a>
              (iPhone en Android, zonder account).
            </li>
            <li>
              Tik in ntfy op <strong>+</strong> en abonneer je op dit onderwerp:
              <span class="mt-1.5 flex items-center gap-2">
                <code class="min-w-0 flex-1 truncate rounded-lg bg-plane px-3 py-2 font-mono text-xs ring-1 ring-line">{{ topic }}</code>
                <button
                  type="button"
                  class="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 font-medium ring-1 ring-field hover:bg-hover"
                  @click="copyTopic"
                >
                  <Icon name="copy" class="size-4" />
                  {{ copied ? 'Gekopieerd' : 'Kopieer' }}
                </button>
              </span>
              <span class="mt-1 block text-xs text-ink-muted">Wie dit onderwerp kent, kan je meldingen lezen. Deel het niet.</span>
            </li>
            <li>
              <span class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  class="rounded-lg px-3 py-2 font-medium ring-1 ring-field hover:bg-hover disabled:opacity-50"
                  :disabled="testState === 'sending'"
                  @click="sendTest"
                >
                  Testmelding sturen
                </button>
                <span class="text-ink-secondary" role="status">{{ testText }}</span>
              </span>
            </li>
          </ol>
          <details class="mt-4 text-sm">
            <summary class="font-medium text-accent">Luistert je telefoon al naar een ander onderwerp?</summary>
            <form class="mt-2 flex gap-2" @submit.prevent="switchTopic">
              <label class="min-w-0 flex-1">
                <span class="sr-only">Onderwerp van je telefoon</span>
                <input
                  v-model="otherTopic"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="weekendjeweg-…"
                  class="w-full rounded-lg bg-surface px-3 py-2 font-mono text-xs ring-1 ring-field focus:ring-2 focus:ring-accent focus:outline-none"
                />
              </label>
              <button type="submit" class="rounded-lg px-3 py-2 font-medium ring-1 ring-field hover:bg-hover">Gebruiken</button>
            </form>
            <p v-if="topicError" class="mt-1 text-warning-ink" role="alert">{{ topicError }}</p>
          </details>
        </section>

        <section v-if="listed.length" class="py-5" aria-labelledby="alert-list-title">
          <h3 id="alert-list-title" class="font-semibold">Je alarmen</h3>
          <ul class="mt-1 divide-y divide-line">
            <li v-for="alert in listed" :key="alert.id" class="flex items-center gap-3 py-2.5">
              <Icon name="bell" class="size-4 text-ink-secondary" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium" :title="alert.label">{{ alert.label }}</p>
                <p class="text-xs text-ink-secondary">{{ alert.detail }}</p>
              </div>
              <button
                type="button"
                class="grid size-9 shrink-0 place-items-center rounded-full hover:bg-hover"
                :aria-label="`Alarm verwijderen: ${alert.label}`"
                @click="remove(alert.id)"
              >
                <Icon name="trash" class="size-4" />
              </button>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </dialog>
</template>
