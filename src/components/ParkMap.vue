<script setup>
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useTheme } from '../composables/useTheme.js';
import { formatEuros, formatPercent, formatWeekend } from '../lib/format.js';

// The parks of the current search on a map, each with its price; clicking one opens it like a card does. Loaded only
// when the map is shown, so the list does not carry the map library.
const props = defineProps({
  // One deal per park, as the cards: [{ park, weekend }]
  deals: { type: Array, required: true },
  // The home address the distance filter measures from, if one is set: { lat, lng, label }
  origin: { type: Object, default: null },
});
const emit = defineEmits(['open']);

// OpenStreetMap's own tiles: free with attribution, fine for a site this size.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers';
// Dark mode turns the light tiles round, so the map does not light up the page.
const DARK_TILES = 'invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9)';
const MAX_FIT_ZOOM = 10;

const container = ref(null);
const { isDark } = useTheme();
let map = null;
let layer = null;

/** Park names come from the providers, so the tooltip is built from text, never from HTML. */
function tooltip({ park, weekend }) {
  const box = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = park.name;
  const line = document.createElement('div');
  const discount = weekend.discount > 0 ? ` · ${formatPercent(weekend.discount)} onder normaal` : '';
  line.textContent = `${formatWeekend(weekend)} · ${formatEuros(weekend.priceCents)}${discount}`;
  box.append(name, line);
  return box;
}

function draw() {
  layer.clearLayers();
  const points = [];
  for (const deal of props.deals) {
    const { park, weekend } = deal;
    if (park.lat == null || park.lng == null) continue;
    const below = weekend.discount > 0;
    const icon = L.divIcon({
      className: '',
      iconSize: null,
      html: `<span class="block -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap shadow-md ring-2 ring-surface tabular-nums ${below ? 'bg-accent text-on-accent' : 'bg-surface text-ink'}">${formatEuros(weekend.priceCents)}</span>`,
    });
    L.marker([park.lat, park.lng], { icon, title: park.name, riseOnHover: true })
      .bindTooltip(tooltip(deal), { direction: 'top', offset: [0, -12] })
      .on('click', () => emit('open', deal))
      .addTo(layer);
    points.push([park.lat, park.lng]);
  }
  if (props.origin) {
    L.circleMarker([props.origin.lat, props.origin.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#0f6b66', fillOpacity: 1 })
      .bindTooltip('Thuis')
      .addTo(layer);
    points.push([props.origin.lat, props.origin.lng]);
  }
  // The map may have been made before its box had a size (its stylesheet loads with it); measure again first.
  map.invalidateSize();
  if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: MAX_FIT_ZOOM });
}

const shade = () => (map.getPane('tilePane').style.filter = isDark.value ? DARK_TILES : '');

onMounted(() => {
  map = L.map(container.value, { scrollWheelZoom: false }).setView([52.2, 5.3], 7);
  L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(map);
  layer = L.layerGroup().addTo(map);
  shade();
  draw();
});
onBeforeUnmount(() => map?.remove());
watch(() => [props.deals, props.origin], draw);
watch(isDark, shade);
</script>

<template>
  <!-- isolate: the map's own layers stay below the sticky top bar. -->
  <div
    ref="container"
    class="isolate h-[70vh] min-h-96 overflow-hidden rounded-3xl ring-1 ring-line"
    role="region"
    aria-label="Kaart met de parken en hun prijs; de lijst eronder heeft dezelfde parken"
  />
</template>
