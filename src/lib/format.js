const euros = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const day = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const timestamp = new Intl.DateTimeFormat('nl-NL', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const time = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' });

const parseIsoDate = (isoDate) => new Date(`${isoDate}T00:00:00Z`);

// Whole euros rounded up, as Landal shows its prices: € 1.452,20 is "€ 1.453" there, and so here.
export const wholeEuros = (cents) => Math.ceil(cents / 100);
export const formatEuros = (cents) => euros.format(wholeEuros(cents));
export const formatDay = (isoDate) => day.format(parseIsoDate(isoDate));
export const formatShortDate = (isoDate) => shortDate.format(parseIsoDate(isoDate));
export const formatWeekend = ({ arrival, departure }) => `${formatDay(arrival)} – ${formatDay(departure)}`;
export const formatPercent = (share) => `${Math.round(share * 100)}%`;
export const formatTimestamp = (isoDateTime) => timestamp.format(new Date(isoDateTime));
export const formatTime = (isoDateTime) => time.format(new Date(isoDateTime));
export const formatRating = (rating) => rating.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const DAY_MS = 24 * 60 * 60 * 1000;
export const nights = ({ arrival, departure }) => Math.round((parseIsoDate(departure) - parseIsoDate(arrival)) / DAY_MS);

const COUNTRY_NAMES = {
  NL: 'Nederland',
  BE: 'België',
  DE: 'Duitsland',
  AT: 'Oostenrijk',
  // Landal uses the Dutch abbreviation.
  VK: 'Verenigd Koninkrijk',
  DK: 'Denemarken',
  CH: 'Zwitserland',
  CZ: 'Tsjechië',
  HU: 'Hongarije',
  FR: 'Frankrijk',
};
export const countryName = (code) => COUNTRY_NAMES[code] ?? code;
