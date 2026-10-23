import { formatPercent, formatShortDate } from './format.js';

const VERDICT_LABELS = { book: 'Nu boeken', wait: 'Wachten kan', neutral: 'Geen duidelijk advies' };

export const verdictLabel = (verdict) => VERDICT_LABELS[verdict] ?? VERDICT_LABELS.neutral;

const day = (timestamp) => formatShortDate(timestamp.slice(0, 10));

/** One sentence per reason the booking advice gives, see shared/advice.mjs. */
export function reasonText(reason) {
  switch (reason.code) {
    case 'leaving-soon':
      return reason.days <= 1
        ? 'Vertrek is morgen: wachten levert niets meer op.'
        : `Vertrek over ${reason.days} dagen: wachten levert weinig op en het huisje kan weg zijn.`;
    case 'selling-out':
      return `Dit weekend raakt vol: ${formatPercent(reason.share)} minder parken beschikbaar dan op ${day(reason.since)}.`;
    case 'rising':
      return `De prijs steeg ${formatPercent(reason.share)} sinds ${day(reason.since)}.`;
    case 'falling': {
      const weeks = Math.floor(reason.daysLeft / 7);
      const timeLeft = reason.daysLeft > 21 ? `; er zijn nog ${weeks} weken tot vertrek` : '';
      return `De prijs daalde ${formatPercent(reason.share)} sinds ${day(reason.since)}${timeLeft}.`;
    }
    case 'lowest-yet':
      return `Laagste prijs sinds we dit weekend volgen (${day(reason.since)}).`;
    case 'stable':
      return `De prijs is stabiel sinds ${day(reason.since)}.`;
    case 'too-new':
      return `We volgen dit weekend pas sinds ${day(reason.since)}; het advies volgt na een paar dagen meten.`;
    default:
      return '';
  }
}
