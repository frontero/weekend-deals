<script setup>
import { computed, onUnmounted, ref } from 'vue';
import Icon from '../../components/Icon.vue';
import { formatEuros, formatShortDate, formatTime, formatTimestamp, wholeEuros } from '../../lib/format.js';
import { providerName } from '../../lib/providers.js';
import ChartCard from '../components/ChartCard.vue';
import EChart from '../components/EChart.vue';
import { dayTimeline, groupedColumns, heatmap, percentLabel, tooltipRow, tooltipTitle } from '../lib/chart-options.js';
import { PROVIDER_ORDER, providerColor, usePalette } from '../lib/palette.js';
import { count } from '../useRounds.js';

// The price watch samples every half hour; its analysis is recomputed after each run.
const REFRESH_MS = 5 * 60 * 1000;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const WEEKDAYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const WEEKDAY_LABELS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const PATTERN_CHANCE = 0.01;
const LIKELY_CHANCE = 0.05;
const MOSTLY_BATCHED = 0.6;
// A pattern counts as fixed once the biggest update fell in the same hour on most of at least this many days.
const FIXED_DAYS = 3;
const FIXED_SHARE = 0.6;
const RECENT_SHOWN = 40;
const WHAT_IS_WATCHED = {
  landal: 'elk vrij huisje in 5 parken',
  topparken: 'het goedkoopste verblijf per park',
  molecaten: 'de 12 goedkoopste huisjes in Nederland',
};

const palette = usePalette();
const watch = ref(null);
// loading, missing, failed or ready
const state = ref('loading');
const heatProvider = ref('landal');
let timer = null;

async function load() {
  clearTimeout(timer);
  try {
    const response = await fetch('/api/admin/watch');
    if (response.status === 404) state.value = 'missing';
    else if (!response.ok) throw new Error(`Price watch failed with ${response.status}`);
    else {
      watch.value = await response.json();
      state.value = 'ready';
    }
  } catch {
    if (!watch.value) state.value = 'failed';
  }
  timer = setTimeout(load, REFRESH_MS);
}
load();
onUnmounted(() => clearTimeout(timer));

const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;
const providers = computed(() => PROVIDER_ORDER.filter((id) => watch.value?.providers[id]));
const rate = (bin) => (bin.compared ? (bin.changed / bin.compared) * 100 : null);

/** "06:00–07:00 en 08:00–09:00": consecutive hours joined into ranges. */
function hourRanges(hours) {
  const ranges = [];
  for (const hour of hours) {
    const last = ranges.at(-1);
    if (last && last[1] === hour) last[1] = hour + 1;
    else ranges.push([hour, hour + 1]);
  }
  const text = ranges.map(([from, to]) => `${hourLabel(from)}–${hourLabel(to % 24)}`);
  return text.length > 1 ? `${text.slice(0, -1).join(', ')} en ${text.at(-1)}` : (text[0] ?? '');
}

function chanceText(chance) {
  if (chance == null) return '';
  if (chance < 0.001) return 'Kans dat dit toeval is: kleiner dan 1 op 1.000';
  if (chance < 0.01) return 'Kans dat dit toeval is: kleiner dan 1%';
  return `Kans dat dit toeval is: ${Math.round(chance * 100)}%`;
}

const verdicts = computed(() =>
  providers.value.map((id) => {
    const data = watch.value.providers[id];
    const { totals, busiest, usual } = data;
    const facts = [];
    let verdict;
    let tone;
    if (!data.enough) {
      verdict = 'Nog te weinig data';
      tone = 'neutral';
      facts.push(`${count(totals.changed)} ${totals.changed === 1 ? 'prijswijziging' : 'prijswijzigingen'} in ${watch.value.days} ${watch.value.days === 1 ? 'dag' : 'dagen'}; er zijn er minstens 10 nodig.`);
    } else {
      const chance = data.chanceByHour;
      const fixed = usual.of >= FIXED_DAYS && usual.days / usual.of >= FIXED_SHARE;
      if (chance < PATTERN_CHANCE && fixed) verdict = 'Vast patroon';
      else if (chance < LIKELY_CHANCE) verdict = 'Waarschijnlijk een patroon';
      else verdict = 'Lijkt willekeurig';
      tone = chance < LIKELY_CHANCE ? 'pattern' : 'random';
      if (chance < LIKELY_CHANCE && busiest.hours.length) {
        facts.push(`${Math.round(busiest.share * 100)}% van de wijzigingen tussen ${hourRanges(busiest.hours)}.`);
      }
      if (usual.of >= FIXED_DAYS) facts.push(`De grootste update kwam op ${usual.days} van ${usual.of} dagen rond ${hourLabel(usual.hour)}.`);
      else if (chance < LIKELY_CHANCE) {
        facts.push(`Nog maar op ${usual.of} ${usual.of === 1 ? 'dag' : 'dagen'} een update gezien; na een paar dagen is duidelijk of het elke dag zo gaat.`);
      }
      facts.push(chanceText(chance) + '.');
    }
    if (totals.changed) {
      facts.push(data.batchShare >= MOSTLY_BATCHED ? 'Meestal veel prijzen tegelijk: een update van het hele systeem.' : 'Meestal losse prijzen: geen grote updates.');
    }
    return {
      id,
      name: providerName(id),
      color: providerColor(palette.value, id),
      verdict,
      tone,
      facts,
      watched: WHAT_IS_WATCHED[id],
      numbers: [
        ['omlaag', count(totals.down)],
        ['omhoog', count(totals.up)],
        ['vergeleken', count(totals.compared)],
      ],
    };
  }),
);

const coverageText = computed(() => {
  if (!watch.value) return '';
  const { since, runs, days, gaps } = watch.value;
  const parts = [`Gemeten sinds ${formatTimestamp(since)}`, `${count(runs)} metingen over ${days} ${days === 1 ? 'dag' : 'dagen'}`];
  if (gaps.length) parts.push(`${gaps.length} ${gaps.length === 1 ? 'onderbreking' : 'onderbrekingen'} van meer dan 40 minuten`);
  return parts.join(' · ');
});

const hourChart = computed(() => {
  const series = providers.value.map((id) => ({
    name: providerName(id),
    color: providerColor(palette.value, id),
    values: watch.value.providers[id].hours.map(rate),
  }));
  const percent = (value) => `${value < 1 && value > 0 ? value.toLocaleString('nl-NL', { maximumFractionDigits: 1 }) : Math.round(value)}%`;
  return {
    option: groupedColumns(palette.value, {
      labels: HOURS.map(hourLabel),
      titles: HOURS.map((hour) => `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`),
      series,
      valueFormatter: percent,
      tooltipNote: (hour) => `${watch.value.coverage[hour]} metingen in dit uur`,
    }),
    table: {
      columns: [{ label: 'Uur' }, ...series.map((item) => ({ label: item.name, align: 'right' })), { label: 'Metingen', align: 'right' }],
      rows: HOURS.map((hour) => [
        `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`,
        ...providers.value.map((id) => {
          const bin = watch.value.providers[id].hours[hour];
          return bin.compared ? `${bin.changed} van ${count(bin.compared)}` : '–';
        }),
        count(watch.value.coverage[hour]),
      ]),
    },
  };
});

const timelineChart = computed(() => {
  const days = [...new Set(providers.value.flatMap((id) => watch.value.providers[id].timeline.map((item) => item.date)))].sort();
  const dayIndex = new Map(days.map((day, index) => [day, index]));
  const groups = providers.value.map((id) => ({
    name: providerName(id),
    color: providerColor(palette.value, id),
    points: watch.value.providers[id].timeline
      .filter((item) => item.timed)
      .map((item) => ({
        x: item.hour + item.minute / 60,
        y: dayIndex.get(item.date),
        size: Math.min(28, 8 + Math.sqrt(item.changed) * 3),
        title: `${providerName(id)} · tussen ${formatTime(item.from)} en ${formatTime(item.at)}`,
        rows: [
          ['prijzen veranderd', count(item.changed)],
          ['van de vergeleken prijzen', `${Math.round((item.changed / item.compared) * 100)}%`],
        ],
      })),
  }));
  const timed = groups.reduce((sum, group) => sum + group.points.length, 0);
  return {
    empty: timed ? '' : 'Nog geen prijswijzigingen gezien.',
    option: dayTimeline(palette.value, { days: days.map((day) => formatShortDate(day)), groups }),
    height: `${Math.max(12, days.length * 2.5 + 6)}rem`,
    table: {
      columns: [{ label: 'Wanneer' }, { label: 'Aanbieder' }, { label: 'Veranderd', align: 'right' }],
      rows: providers.value.flatMap((id) =>
        watch.value.providers[id].timeline.map((item) => [`${formatTimestamp(item.from ?? item.at)} – ${formatTime(item.at)}`, providerName(id), count(item.changed)]),
      ),
    },
  };
});

const weekChart = computed(() => {
  const data = watch.value.providers[heatProvider.value];
  if (!data) return null;
  const cells = data.grid.flatMap((row, weekday) =>
    row.flatMap((bin, hour) => (bin.compared ? [[hour, weekday, rate(bin), bin, weekday, hour]] : [])),
  );
  const max = Math.max(1, ...cells.map((cell) => cell[2]));
  return {
    option: heatmap(palette.value, {
      xLabels: HOURS.map(hourLabel),
      yLabels: WEEKDAY_LABELS,
      cells,
      min: 0,
      max,
      topDown: true,
      legendFormatter: (value) => `${Math.round(value)}%`,
      tooltip: ([, , value, bin, weekday, hour]) =>
        tooltipTitle(`${WEEKDAYS[weekday]} ${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`) +
        tooltipRow(providerColor(palette.value, heatProvider.value), 'van de prijzen veranderd', percentLabel(value)) +
        tooltipRow(palette.value.deemphasis, 'gewijzigd', `${bin.changed} van ${count(bin.compared)}`),
    }),
    table: {
      columns: [{ label: 'Moment' }, { label: 'Veranderd', align: 'right' }],
      rows: cells.map(([hour, weekday, , bin]) => [`${WEEKDAYS[weekday]} ${hourLabel(hour)}`, `${bin.changed} van ${count(bin.compared)}`]),
    },
  };
});

const recent = computed(() =>
  (watch.value?.recent ?? []).slice(0, RECENT_SHOWN).map((change, index) => {
    const difference = wholeEuros(change.newCents) - wholeEuros(change.oldCents);
    return {
      key: `${change.at}|${change.park}|${change.accommodation}|${change.arrival}|${index}`,
      when: formatTimestamp(change.at),
      provider: providerName(change.provider),
      park: change.parkName,
      to: change.provider === 'landal' ? `/beheer/parken/${encodeURIComponent(change.park)}` : null,
      weekend: formatShortDate(change.arrival),
      before: formatEuros(change.oldCents),
      after: formatEuros(change.newCents),
      difference: `${difference > 0 ? '+' : '−'}${formatEuros(Math.abs(difference) * 100)}`,
      differenceClass: difference < 0 ? 'text-good-ink' : 'text-warning-ink',
    };
  }),
);
</script>

<template>
  <p v-if="state === 'loading'" class="text-ink-secondary" role="status">Laden…</p>
  <p v-else-if="state === 'missing'" class="rounded-2xl bg-surface px-4 py-10 text-center text-ink-secondary ring-1 ring-line">
    De prijswacht heeft nog niet gemeten. De eerste meting volgt binnen een half uur.
  </p>
  <p v-else-if="state === 'failed'" class="rounded-2xl bg-warning-wash px-4 py-3 text-sm text-warning-ink" role="status">
    De prijswacht kon niet worden geladen.
  </p>
  <div v-else class="flex flex-col gap-6">
    <div class="flex max-w-4xl flex-col gap-1">
      <p class="text-ink-secondary">
        Elk half uur doet de prijswacht dezelfde zoekopdrachten voor 2 personen en 3 vaste weekenden. Zo is per half uur
        te zien wanneer aanbieders hun prijzen aanpassen, en of dat volgens een vast patroon gaat of willekeurig.
      </p>
      <p class="text-sm text-ink-muted">{{ coverageText }}</p>
    </div>

    <section aria-label="Conclusie per aanbieder" class="grid gap-3 lg:grid-cols-3">
      <article v-for="item in verdicts" :key="item.id" class="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line sm:p-5">
        <div>
          <h2 class="flex items-center gap-2 text-sm font-medium text-ink-secondary">
            <span class="size-2.5 rounded-full" :style="{ background: item.color }" aria-hidden="true" />
            {{ item.name }}
          </h2>
          <p class="mt-1 text-xl font-semibold tracking-tight" :class="item.tone === 'pattern' ? 'text-accent' : ''">{{ item.verdict }}</p>
        </div>
        <ul class="flex flex-col gap-1.5 text-sm">
          <li v-for="fact in item.facts" :key="fact" class="flex gap-2">
            <Icon name="check" class="mt-0.5 size-4 shrink-0 text-ink-muted" />
            {{ fact }}
          </li>
        </ul>
        <dl class="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-3 text-sm">
          <div v-for="[label, value] in item.numbers" :key="label">
            <dt class="text-ink-secondary">{{ label }}</dt>
            <dd class="font-semibold tabular-nums">{{ value }}</dd>
          </div>
        </dl>
        <p class="text-xs text-ink-muted">Gevolgd: {{ item.watched }}.</p>
      </article>
    </section>

    <ChartCard
      title="Wanneer veranderen prijzen"
      subtitle="Per uur van de dag: welk deel van de gevolgde prijzen toen veranderde, per aanbieder"
      :table="hourChart.table"
    >
      <EChart :option="hourChart.option" height="20rem" label="Deel van de prijzen dat veranderde per uur van de dag" />
    </ChartCard>

    <div class="grid gap-4 xl:grid-cols-2">
      <ChartCard
        title="Elke wijziging op een rij"
        subtitle="Per dag de momenten waarop prijzen veranderden; hoe groter de stip, hoe meer tegelijk. Een vast patroon staat elke dag op dezelfde plek."
        :table="timelineChart.table"
        :empty="timelineChart.empty"
      >
        <EChart :option="timelineChart.option" :height="timelineChart.height" label="Prijswijzigingen per dag en tijdstip" />
      </ChartCard>

      <ChartCard
        v-if="weekChart"
        title="Per dag van de week"
        subtitle="Welk deel van de prijzen veranderde per weekdag en uur; wordt zinvol na een paar weken"
        :table="weekChart.table"
      >
        <template #actions>
          <label class="flex items-center gap-2 text-sm">
            <span class="sr-only">Aanbieder</span>
            <select v-model="heatProvider" class="h-8 rounded-lg bg-surface px-2 ring-1 ring-field">
              <option v-for="id in providers" :key="id" :value="id">{{ providerName(id) }}</option>
            </select>
          </label>
        </template>
        <EChart :option="weekChart.option" label="Prijswijzigingen per weekdag en uur" />
      </ChartCard>
    </div>

    <section class="rounded-2xl bg-surface ring-1 ring-line" aria-labelledby="recent-title">
      <h2 id="recent-title" class="border-b border-line px-4 py-3 font-semibold sm:px-5">Laatste prijswijzigingen</h2>
      <p v-if="!recent.length" class="px-4 py-6 text-sm text-ink-secondary sm:px-5">Nog geen prijswijzigingen gezien.</p>
      <div v-else class="max-h-[32rem] overflow-auto">
        <table class="w-full min-w-[40rem] text-left text-sm">
          <thead class="sticky top-0 bg-surface text-ink-secondary">
            <tr class="border-b border-line">
              <th scope="col" class="px-4 py-2.5 font-medium sm:px-5">Gezien</th>
              <th scope="col" class="px-3 py-2.5 font-medium">Park</th>
              <th scope="col" class="px-3 py-2.5 font-medium">Weekend</th>
              <th scope="col" class="px-4 py-2.5 text-right font-medium sm:px-5">Prijs</th>
            </tr>
          </thead>
          <tbody class="tabular-nums">
            <tr v-for="change in recent" :key="change.key" class="border-b border-line last:border-0">
              <td class="px-4 py-2 whitespace-nowrap sm:px-5">{{ change.when }}</td>
              <td class="px-3 py-2">
                <RouterLink v-if="change.to" :to="change.to" class="font-medium text-accent hover:underline">{{ change.park }}</RouterLink>
                <span v-else class="font-medium">{{ change.park }}</span>
                <span class="block text-xs text-ink-secondary">{{ change.provider }}</span>
              </td>
              <td class="px-3 py-2 whitespace-nowrap">{{ change.weekend }}</td>
              <td class="px-4 py-2 text-right whitespace-nowrap sm:px-5">
                <span class="text-ink-secondary">{{ change.before }} →</span> {{ change.after }}
                <span class="ml-1 font-semibold" :class="change.differenceClass">{{ change.difference }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
