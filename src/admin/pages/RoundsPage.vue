<script setup>
import Icon from '../../components/Icon.vue';
import { TOTALS, useRounds } from '../useRounds.js';

const { rounds, retry, retryState } = useRounds();
</script>

<template>
  <section class="flex flex-col gap-3">
    <div>
      <p class="max-w-3xl text-sm text-ink-secondary">
        Een ronde haalt de prijzen voor alle groepsgroottes na elkaar op. Lager en hoger: hetzelfde huisje kreeg een
        andere prijs. Ander huisje: een ander huisje is nu het goedkoopst van het park. De aantallen tellen alle
        groepsgroottes bij elkaar op.
      </p>
    </div>
    <p v-if="!rounds.length" class="text-ink-secondary">Er is nog geen ronde gedraaid.</p>
    <ol v-else class="flex flex-col gap-3">
      <li v-for="round in rounds" :key="round.id">
        <article class="rounded-2xl bg-surface ring-1 ring-line" :aria-labelledby="`round-${round.id}`">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-4">
            <h2 :id="`round-${round.id}`" class="font-semibold">{{ round.title }}</h2>
            <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="round.badge.classes">
              {{ round.badge.label }}
            </span>
            <span class="text-sm text-ink-secondary">{{ round.meta }}</span>
            <button
              v-if="round.retry?.parties"
              type="button"
              class="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-sm font-medium ring-1 ring-line hover:ring-field disabled:opacity-60 sm:ml-auto"
              :disabled="retryState === 'sending'"
              @click="retry(round.retry.parties)"
            >
              <Icon name="refresh" class="size-4" :class="retryState === 'sending' ? 'animate-spin' : ''" />
              {{ round.retry.label }}
            </button>
          </div>
          <p v-if="round.retry?.note" class="flex items-start gap-2 px-4 pt-2 text-sm text-ink-secondary">
            <Icon name="refresh" class="mt-px size-4" />
            {{ round.retry.note }}
          </p>
          <p v-if="round.retry?.parties && retryState === 'failed'" class="px-4 pt-2 text-sm text-warning-ink" role="status">
            Het verzoek lukte niet. Probeer het nog eens.
          </p>
          <p v-if="round.retry?.waiting" class="flex items-start gap-2 px-4 pt-2 text-sm text-accent" role="status">
            <Icon name="clock" class="mt-px size-4" />
            {{ round.retry.waiting }}
          </p>
          <ul v-if="round.totals" class="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-2 text-sm">
            <li v-for="total in round.totals" :key="total.count" :class="total.classes">
              <span class="font-semibold">{{ total.value }}</span> {{ total.label }}
            </li>
          </ul>
          <p v-if="round.note" class="px-4 pt-2 text-sm text-ink-secondary">{{ round.note }}</p>

          <details class="group mt-3 border-t border-line">
            <summary
              class="flex items-center gap-2 rounded-b-2xl px-4 py-3 text-sm font-medium text-accent hover:bg-hover group-open:rounded-none"
            >
              <Icon name="plus" class="size-4 group-open:hidden" />
              <Icon name="minus" class="hidden size-4 group-open:block" />
              Per groepsgrootte{{ round.moves.length ? ' en grootste wijzigingen' : '' }}
            </summary>
            <div class="flex flex-col gap-4 px-4 pb-4">
              <div class="overflow-x-auto">
                <table class="w-full min-w-[36rem] text-left text-sm">
                  <caption class="sr-only">
                    Per groepsgrootte
                  </caption>
                  <thead class="text-ink-secondary">
                    <tr class="border-b border-line">
                      <th scope="col" class="py-2 pr-3 font-medium">Grootte</th>
                      <th scope="col" class="py-2 pr-3 font-medium">Status</th>
                      <th v-for="total in TOTALS" :key="total.count" scope="col" class="py-2 pr-3 text-right font-medium">
                        {{ total.heading }}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="tabular-nums">
                    <tr v-for="size in round.sizes" :key="size.id" class="border-b border-line last:border-0">
                      <th scope="row" class="py-2 pr-3 font-medium whitespace-nowrap">{{ size.size }}</th>
                      <td class="py-2 pr-3 whitespace-nowrap" :title="size.error ?? undefined">{{ size.state }}</td>
                      <td v-for="(cell, index) in size.cells" :key="index" class="py-2 pr-3 text-right">{{ cell }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-if="round.moves.length">
                <h3 class="text-sm font-semibold">Grootste prijswijzigingen</h3>
                <ul class="mt-2 divide-y divide-line text-sm">
                  <li
                    v-for="move in round.moves"
                    :key="move.key"
                    class="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-3"
                  >
                    <span class="min-w-0 flex-1">
                      <a
                        v-if="move.url"
                        :href="move.url"
                        target="_blank"
                        rel="noopener"
                        class="inline-flex items-center gap-1 rounded font-medium text-accent hover:underline"
                        :title="`Bekijk op ${move.provider}`"
                      >
                        {{ move.park }}
                        <Icon name="external" class="size-3.5" />
                        <span class="sr-only">(op {{ move.provider }}, opent in een nieuw tabblad)</span>
                      </a>
                      <span v-else class="font-medium">{{ move.park }}</span>
                      <span class="block text-ink-secondary">{{ move.detail }}</span>
                    </span>
                    <span class="tabular-nums whitespace-nowrap">
                      <span class="text-ink-secondary">{{ move.before }} →</span> {{ move.after }}
                      <span class="ml-1 font-semibold" :class="move.classes">{{ move.difference }}</span>
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </details>
        </article>
      </li>
    </ol>
  </section>
</template>
