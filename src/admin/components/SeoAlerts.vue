<script setup>
import { computed } from 'vue';
import { formatShortDate } from '../../lib/format.js';
import { count } from '../useRounds.js';

// Definitions
const props = defineProps({
  report: { type: Object, required: true },
});
const dateTime = new Intl.DateTimeFormat('nl-NL', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Amsterdam',
});

// Computed
const checks = computed(() => [
  { label: 'Laatste Search Console-controle', at: props.report.checkedAt },
  { label: 'Laatste URL-inspectie', at: props.report.indexCheckedAt },
  { label: 'Vertoningen opgehaald op', at: props.report.impressionCheckedAt },
]);
const periodLabel = computed(() => {
  const weeks = props.report.impressions;
  if (weeks === null) {
    return null;
  }
  const current = `${formatShortDate(weeks.start)} t/m ${formatShortDate(weeks.end)}`;
  const previous = `${formatShortDate(weeks.previousStart)} t/m ${formatShortDate(weeks.previousEnd)}`;
  return `${current} vergeleken met ${previous}`;
});

// Functions
const checkedLabel = (value) => dateTime.format(new Date(value));
</script>

<template>
  <section class="space-y-3" aria-labelledby="seo-alerts-title">
    <h2 id="seo-alerts-title" class="text-lg font-semibold">SEO-waarschuwingen</h2>
    <dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
      <div
        v-for="check in checks"
        :key="check.label"
      >
        <dt class="text-ink-secondary">{{ check.label }}</dt>
        <dd class="font-semibold">
          <time v-if="check.at !== null" :datetime="check.at">{{ checkedLabel(check.at) }}</time>
          <span v-else>Nog geen controle</span>
        </dd>
      </div>
    </dl>
    <div class="grid gap-3 xl:grid-cols-2">
      <section class="min-w-0 rounded-2xl bg-surface p-4 ring-1 ring-line" aria-labelledby="seo-index-loss">
        <h3 id="seo-index-loss" class="font-semibold">Belangrijke pagina’s uit de index</h3>
        <p v-if="report.indexCheckedAt === null" class="mt-2 text-sm text-ink-secondary">Wacht op de eerste URL-inspectie.</p>
        <p v-else-if="report.indexLosses.length === 0" class="mt-2 text-sm text-ink-secondary">Geen nieuwe uitsluitingen vastgesteld bij eerder geïndexeerde pagina’s.</p>
        <ul v-else class="mt-3 space-y-2">
          <li
            v-for="loss in report.indexLosses"
            :key="loss.path"
            class="rounded-xl bg-warning-wash px-3 py-2 text-sm text-warning-ink"
          >
            <a :href="loss.path" class="font-bold underline">{{ loss.label }}</a>
            <p>Uit de index gemeld op <time :datetime="loss.indexLostAt">{{ checkedLabel(loss.indexLostAt) }}</time></p>
            <p v-if="loss.lastIndexedAt !== null">
              Eerder geïndexeerd op <time :datetime="loss.lastIndexedAt">{{ checkedLabel(loss.lastIndexedAt) }}</time>
            </p>
            <p v-if="loss.checkedAt !== loss.indexLostAt">
              Laatste controle <time :datetime="loss.checkedAt">{{ checkedLabel(loss.checkedAt) }}</time>
            </p>
            <p v-if="loss.coverage !== ''">{{ loss.coverage }}</p>
            <p v-if="loss.googlebot !== null">
              Googlebot <time :datetime="loss.googlebot.visitedAt">{{ checkedLabel(loss.googlebot.visitedAt) }}</time>
              · HTTP {{ loss.googlebot.status }}
            </p>
          </li>
        </ul>
      </section>
      <section class="min-w-0 rounded-2xl bg-surface p-4 ring-1 ring-line" aria-labelledby="seo-impression-loss">
        <h3 id="seo-impression-loss" class="font-semibold">Teruglopende vertoningen</h3>
        <p v-if="report.impressions === null" class="mt-2 text-sm text-ink-secondary">
          Wacht op definitieve dagcijfers voor twee volledige weken.
        </p>
        <template v-else>
          <p class="mt-2 text-sm text-ink-secondary">{{ periodLabel }}</p>
          <p v-if="report.impressions.drops.length === 0" class="mt-2 text-sm text-ink-secondary">Geen daling boven de waarschuwingsdrempel.</p>
          <ul v-else class="mt-3 space-y-2">
            <li
              v-for="drop in report.impressions.drops"
              :key="drop.path ?? drop.label"
              class="rounded-xl bg-warning-wash px-3 py-2 text-sm text-warning-ink"
            >
              <a v-if="drop.path !== null" :href="drop.path" class="font-bold underline">{{ drop.label }}</a>
              <strong v-else>{{ drop.label }}</strong>
              <p>Van {{ count(drop.previous) }} naar {{ count(drop.current) }} vertoningen · {{ drop.percent }}% minder</p>
            </li>
          </ul>
          <p v-if="report.impressions.hasPageData === false" class="mt-2 text-sm text-ink-secondary">
            De uitsplitsing per paginatype en pagina wordt nog opgehaald.
          </p>
          <p class="mt-2 text-xs text-ink-secondary">
            Een waarschuwing verschijnt bij minstens 30% daling en een verlies van minimaal 100 vertoningen voor de site, 50 per paginatype of 20 per pagina.
          </p>
        </template>
      </section>
    </div>
  </section>
</template>
