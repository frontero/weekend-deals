import { computed } from 'vue';
import { useTheme } from '../../composables/useTheme.js';

// Chart colours per mode, from the validated data-viz palette: the same hues stepped for each surface. Providers take
// the first three categorical slots, which stay apart for every kind of colour vision; lower and higher prices are
// the two poles of the diverging pair, with gray for "no change".
const LIGHT = {
  surface: '#fcfcfb',
  ink: '#0b0b0b',
  inkSecondary: '#52514e',
  muted: '#6c6a64',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  series: ['#2a78d6', '#eb6834', '#1baf7a'],
  lower: '#2a78d6',
  higher: '#e34948',
  neutral: '#f0efec',
  deemphasis: '#c3c2b7',
  sequential: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
  tooltip: '#ffffff',
};

const DARK = {
  surface: '#1a1a19',
  ink: '#f0efec',
  inkSecondary: '#c3c2b7',
  muted: '#9a988f',
  grid: '#2c2c2a',
  axis: '#383835',
  series: ['#3987e5', '#d95926', '#199e70'],
  lower: '#3987e5',
  higher: '#e66767',
  neutral: '#383835',
  deemphasis: '#55544f',
  // Dark mode anchors the ramp the other way round: little is dark, much is bright.
  sequential: ['#104281', '#184f95', '#256abf', '#2a78d6', '#3987e5', '#6da7ec', '#9ec5f4'],
  tooltip: '#262624',
};

export const PROVIDER_ORDER = ['landal', 'topparken', 'molecaten'];

export function usePalette() {
  const { isDark } = useTheme();
  return computed(() => (isDark.value ? DARK : LIGHT));
}

export const providerColor = (palette, provider) => palette.series[Math.max(0, PROVIDER_ORDER.indexOf(provider))];
