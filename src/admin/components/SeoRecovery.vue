<script setup>
import { computed } from 'vue';
import { formatShortDate } from '../../lib/format.js';
import { count } from '../useRounds.js';

// Definitions
const props = defineProps({ report: { type: Object, default: null } });
const columnTitles = ['Uitgangsniveau', 'Terugval', 'Laatste 3 dagen'];
const groups = [
  { key: 'parks', label: 'Parken' },
  { key: 'regions', label: 'Regio’s en landen' },
];
const metrics = [
  { key: 'impressions', label: 'Vertoningen' },
  { key: 'visits', label: 'Googlebot-bezoeken' },
];
const signed = new Intl.NumberFormat('nl-NL', { signDisplay: 'exceptZero' });

// Computed
const showRecent = computed(() => props.report !== null && props.report.periods[1].end !== props.report.periods[2].end);
const columnCount = computed(() => showRecent.value === true ? 3 : 2);
const columns = computed(() => props.report?.periods.slice(0, columnCount.value).map((period, index) => ({
  label: index === 1 && showRecent.value === false ? 'Terugval · nieuwste cijfers' : columnTitles[index],
  dates: `${formatShortDate(period.start)} – ${formatShortDate(period.end)}`,
})) ?? []);
const rows = computed(() => {
  const report = props.report;
  if (report === null) {
    return [];
  }
  return metrics.flatMap((metric) => groups.map((group) => metricRow(report, metric, group, columnCount.value)));
});
const reportAfterDip = computed(() => props.report?.afterDip === true);
const hasMissingCrawls = computed(() => props.report?.periods.some((period) => period.visits === null) === true);
const hasSampledCrawls = computed(() => props.report?.periods.some((period) => period.sampled === true) === true);
const losses = computed(() => props.report?.biggestLosses.map((row) => ({
  ...row,
  beforeLabel: count(row.before),
  dipLabel: count(row.dip),
  recentLabel: count(row.recent),
  lossLabel: signed.format(row.recent - row.before),
})) ?? []);

// Functions
function recoveryStatus([before, dip, recent], afterDip) {
  if (before === null || dip === null || recent === null) {
    return 'Onvoldoende gegevens';
  }
  if (afterDip === false) {
    return '—';
  }
  if (recent >= before) {
    return 'Op uitgangsniveau of hoger';
  }
  if (recent > dip) {
    return 'In herstel';
  }
  return 'Geen herstel zichtbaar';
}

function metricRow(report, metric, group, visibleColumns) {
  const values = report.periods.map((period) => period[metric.key]?.[group.key] ?? null);
  return {
    label: `${metric.label} · ${group.label}`,
    values: values.slice(0, visibleColumns).map((value, index) => {
      if (value === null) {
        return '—';
      }
      const prefix = metric.key === 'visits' && report.periods[index].sampled === true ? '≈ ' : '';
      return prefix + count(value);
    }),
    status: recoveryStatus(values, report.afterDip),
  };
}
</script>

<template>
  <section class="min-w-0 rounded-2xl bg-surface ring-1 ring-line" aria-labelledby="seo-recovery">
    <h2 id="seo-recovery" class="border-b border-line px-4 py-3 font-semibold sm:px-5">Herstel van park- en regiopagina’s</h2>
    <p v-if="report === null" class="px-4 py-3 text-sm text-ink-secondary sm:px-5">De vergelijking verschijnt zodra de definitieve dagcijfers zijn opgehaald.</p>
    <template v-else>
      <div class="space-y-1 px-4 py-3 text-sm text-ink-secondary sm:px-5">
        <p>Vertoningen komen uit Search Console. Googlebot-bezoeken zijn geverifieerde verzoeken uit Cloudflare over dezelfde dagen.</p>
        <p v-if="reportAfterDip === false">Voor een herstelmeting zijn drie volledige dagen na 25 november nodig. Hieronder staan de laatst beschikbare cijfers.</p>
        <p v-if="hasMissingCrawls">Een streepje bij Googlebot betekent dat minstens één dagtotaal ontbreekt.</p>
        <p v-if="hasSampledCrawls">Cloudflare-cijfers met ≈ zijn schattingen op basis van een steekproef.</p>
      </div>
      <div class="overflow-x-auto" tabindex="0" role="group" aria-label="Herstel van vertoningen en Googlebot-bezoeken">
        <table class="w-full text-left text-sm">
          <thead class="text-ink-secondary">
            <tr class="border-b border-line">
              <th scope="col" class="px-3 py-2.5 font-medium sm:px-5">Meting</th>
              <th v-for="column in columns" :key="column.label" scope="col" class="px-3 py-2.5 text-right font-medium sm:px-5">
                {{ column.label }}
                <span class="block whitespace-nowrap text-xs">{{ column.dates }}</span>
              </th>
              <th scope="col" class="px-3 py-2.5 font-medium sm:px-5">Herstel</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.label" class="border-b border-line last:border-0">
              <th scope="row" class="px-3 py-2.5 font-medium sm:px-5">{{ row.label }}</th>
              <td v-for="(value, index) in row.values" :key="index" class="px-3 py-2.5 text-right tabular-nums sm:px-5">{{ value }}</td>
              <td class="px-3 py-2.5 text-ink-secondary sm:px-5">{{ row.status }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3 id="seo-recovery-losses" class="border-t border-line px-4 py-3 text-sm font-semibold sm:px-5">Grootste verliezen aan vertoningen sinds 20–22 november</h3>
      <p v-if="losses.length === 0" class="px-4 pb-3 text-sm text-ink-secondary sm:px-5">Alle gevolgde pagina’s met vertoningen in de uitgangsperiode staan op hetzelfde niveau of hoger.</p>
      <div v-else class="overflow-x-auto" tabindex="0" role="group" aria-labelledby="seo-recovery-losses">
        <table class="w-full text-left text-sm">
          <thead class="text-ink-secondary">
            <tr class="border-b border-line">
              <th scope="col" class="px-3 py-2.5 font-medium sm:px-5">Pagina</th>
              <th v-for="column in columns" :key="column.label" scope="col" class="px-3 py-2.5 text-right font-medium sm:px-5">{{ column.label }}</th>
              <th scope="col" class="px-3 py-2.5 text-right font-medium sm:px-5">Verschil</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in losses" :key="row.path" class="border-b border-line last:border-0">
              <th scope="row" class="px-3 py-2.5 font-medium sm:px-5"><a :href="row.path" class="break-words text-accent underline">{{ row.path }}</a></th>
              <td class="px-3 py-2.5 text-right tabular-nums sm:px-5">{{ row.beforeLabel }}</td>
              <td class="px-3 py-2.5 text-right tabular-nums sm:px-5">{{ row.dipLabel }}</td>
              <td v-if="showRecent" class="px-3 py-2.5 text-right tabular-nums sm:px-5">{{ row.recentLabel }}</td>
              <td class="px-3 py-2.5 text-right font-semibold tabular-nums text-serious sm:px-5">{{ row.lossLabel }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
