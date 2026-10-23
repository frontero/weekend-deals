import { computed, ref, watch } from 'vue';
import { groupKey, partyOf } from '../../shared/party.mjs';
import { request } from '../lib/api.js';

// A quote is the price of the moment; after this long it is asked again.
const QUOTE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

/**
 * The exact party's price for one park and weekend, asked live from the provider.
 * @param source returns { park, weekend, party }, or null while nothing is open
 * @returns a ref of { state: 'idle' | 'loading' | 'done' | 'failed', quote, ignoresFeatures }; `quote` is null when
 *   nothing is free for that party
 */
export function useQuote(source) {
  const result = ref({ state: 'idle' });
  const input = computed(source);
  const key = computed(() => {
    const { park, weekend, party } = input.value ?? {};
    return park && weekend ? `${park.code}|${weekend.arrival}|${groupKey(party)}` : '';
  });

  watch(
    key,
    async (current) => {
      if (!current) {
        result.value = { state: 'idle' };
        return;
      }
      const cached = cache.get(current);
      if (cached && Date.now() - cached.at < QUOTE_TTL_MS) {
        result.value = cached.result;
        return;
      }
      result.value = { state: 'loading' };
      const { park, weekend, party } = input.value;
      let answer;
      try {
        const body = await request('/quote', {
          method: 'POST',
          body: JSON.stringify({ parkCode: park.code, arrival: weekend.arrival, departure: weekend.departure, ...partyOf(party) }),
        });
        answer = { state: 'done', quote: body.quote, ignoresFeatures: body.ignoresFeatures };
        cache.set(current, { at: Date.now(), result: answer });
      } catch {
        answer = { state: 'failed' };
      }
      // Another park or weekend may have been opened meanwhile.
      if (key.value === current) result.value = answer;
    },
    { immediate: true },
  );

  return result;
}
