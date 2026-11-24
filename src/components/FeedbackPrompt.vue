<script setup>
// "Did you find what you were looking for?": the answer is counted like any other use (src/lib/track.js), a remark
// is kept for the admin's Bezoekers page.
import { ref } from 'vue';
import { track } from '../lib/track.js';

// asking, answered or thanked
const step = ref('asking');
const found = ref('');
const comment = ref('');

function answer(value) {
  found.value = value;
  step.value = 'answered';
  track('found', value);
}

function send() {
  const text = comment.value.trim();
  if (text) {
    const body = JSON.stringify({ found: found.value, comment: text, path: window.location.pathname });
    fetch('/api/feedback', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
  }
  step.value = 'thanked';
}
</script>

<template>
  <section aria-labelledby="feedback-title" class="mx-auto max-w-7xl px-4 pt-8 text-sm sm:px-6">
    <div class="max-w-xl rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 id="feedback-title" class="font-semibold">Heb je gevonden wat je zocht?</h2>
      <p v-if="step === 'thanked'" class="mt-2 text-ink-secondary" role="status">Bedankt, daar hebben we wat aan.</p>
      <div v-else-if="step === 'asking'" class="mt-3 flex gap-2">
        <button type="button" class="rounded-full bg-surface px-4 py-1.5 font-bold ring-2 ring-line transition hover:ring-accent" @click="answer('ja')">Ja</button>
        <button type="button" class="rounded-full bg-surface px-4 py-1.5 font-bold ring-2 ring-line transition hover:ring-accent" @click="answer('nee')">Nee</button>
      </div>
      <form v-else class="mt-3" @submit.prevent="send">
        <label for="feedback-comment" class="font-medium">{{ found === 'ja' ? 'Wat kan er nog beter?' : 'Wat miste je?' }} <span class="font-normal text-ink-secondary">(niet verplicht)</span></label>
        <textarea id="feedback-comment" v-model="comment" maxlength="500" rows="3" class="mt-2 block w-full rounded-xl bg-surface p-2 ring-1 ring-field"></textarea>
        <p class="mt-1 text-xs text-ink-secondary">Zet hier geen naam, adres of e-mailadres in.</p>
        <button type="submit" class="mt-3 rounded-full bg-accent px-4 py-1.5 font-bold text-on-accent transition hover:bg-accent-hover">Verstuur</button>
      </form>
    </div>
  </section>
</template>
