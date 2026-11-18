// The look of each holiday's and season's page (see HOLIDAYS and SEASONS in server/pages.mjs): colours for its banner
// and a drawing of our own, as SVG, so there is no photo licence to keep and it stays sharp at any size.
// Colours are fixed rather than light-dark(): white text on a deep colour reads well on both page themes.
// No Node imports: the Worker serves these.

const round = (number) => Math.round(number * 10) / 10;

/** A firework: rays from its centre, each with a spark at its end. */
function burst(cx, cy, radius, colour, rays = 14) {
  return Array.from({ length: rays }, (_, index) => {
    const angle = (index / rays) * 2 * Math.PI;
    const [x1, y1] = [cx + Math.cos(angle) * radius * 0.35, cy + Math.sin(angle) * radius * 0.35];
    const [x2, y2] = [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
    return `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${colour}" stroke-width="2.5" stroke-linecap="round"/><circle cx="${round(x2)}" cy="${round(y2)}" r="2.6" fill="${colour}"/>`;
  }).join('');
}

/** A string of things hanging from a gently sagging line across the band, e.g. lights or flags. */
function garland(count, { top, sag, line }, piece) {
  const points = Array.from({ length: count }, (_, index) => {
    const x = (index + 0.5) * (1200 / count);
    return [round(x), round(top + sag * Math.sin((x / 1200) * Math.PI))];
  });
  const path = `M0 ${top} ${points.map(([x, y]) => `L${x} ${y}`).join(' ')} L1200 ${top}`;
  return `<path d="${path}" fill="none" stroke="${line}" stroke-width="2"/>${points.map(([x, y], index) => piece(x, y, index)).join('')}`;
}

const TREE = 'M0-60L14-38H7L20-18H10L26 0H-26L-10-18H-20L-7-38H-14Z';
const tree = (x, y, scale, colour) => `<g transform="translate(${x} ${y}) scale(${scale})"><path d="${TREE}" fill="${colour}"/><rect x="-3" y="0" width="6" height="7" fill="${colour}"/></g>`;
const cabin = (x, y, colour) => `<path d="M${x} ${y}l22-18 22 18v20h-44z" fill="${colour}"/>`;
const snowflake = (x, y, scale) =>
  `<path transform="translate(${x} ${y}) scale(${scale})" d="M0-9V9M-7.8-4.5 7.8 4.5M-7.8 4.5 7.8-4.5" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/>`;
const sparkle = (x, y, size, colour) =>
  `<path d="M${x} ${y - size}l${size * 0.28} ${size * 0.72} ${size * 0.72} ${size * 0.28}-${size * 0.72} ${size * 0.28}-${size * 0.28} ${size * 0.72}-${size * 0.28}-${size * 0.72}-${size * 0.72}-${size * 0.28} ${size * 0.72}-${size * 0.28}z" fill="${colour}"/>`;
const confetti = (x, y, angle, colour) => `<rect x="${x}" y="${y}" width="10" height="5" rx="1.5" fill="${colour}" transform="rotate(${angle} ${x + 5} ${y + 2.5})"/>`;

function tulip(x, height, colour) {
  const top = 120 - height;
  return `<path d="M${x} 120V${top + 10}" stroke="#14532d" stroke-width="3"/><path d="M${x} ${top + 34}q-14-6-16-22 12 6 16 22zM${x} ${top + 40}q14-8 15-24-11 8-15 24z" fill="#1f7a45"/><path d="M${x - 9} ${top}q0 16 9 16t9-16l-4.5 5-4.5-7-4.5 7z" fill="${colour}"/>`;
}

const TULIPS = ['#ff5c8a', '#ffd23f', '#ff7a45', '#ffffff', '#c084fc'];

/**
 * Per slug: the banner's background and text colour, the year sticker's colours, a small repeating pattern
 * (a 120 × 120 tile) laid over the background, and a band along the banner's bottom (1200 × 120).
 */
export const OCCASION_ART = {
  kerst: {
    background: 'linear-gradient(160deg, #0d3b2c 0%, #145a3c 100%)',
    ink: '#ffffff',
    sticker: { background: '#d62839', ink: '#ffffff' },
    patternOpacity: 0.18,
    pattern: `${snowflake(24, 28, 1)}${snowflake(84, 78, 0.7)}<circle cx="70" cy="20" r="2" fill="#fff"/><circle cx="20" cy="95" r="1.6" fill="#fff"/><circle cx="105" cy="45" r="1.4" fill="#fff"/>`,
    band: [
      garland(24, { top: 6, sag: 18, line: '#f6e7b8' }, (x, y, index) => `<circle cx="${x}" cy="${y + 6}" r="5" fill="${['#ff4d5e', '#ffd23f', '#ffffff', '#7fd3ff'][index % 4]}"/>`),
      '<path d="M0 120V96Q150 74 300 92T600 90T900 88T1200 94V120Z" fill="#eef6f1"/>',
      ...[[70, 100, 1], [118, 104, 0.7], [330, 98, 0.8], [520, 96, 0.6], [690, 97, 0.9], [740, 100, 0.6], [940, 96, 1.1], [1010, 100, 0.8], [1130, 101, 1]].map(([x, y, scale], index) =>
        tree(x, y, scale, index % 2 ? '#0a2e22' : '#1e7a4f'),
      ),
    ].join(''),
  },
  'oud-en-nieuw': {
    background: 'linear-gradient(160deg, #0b1533 0%, #1f2d6b 100%)',
    ink: '#ffffff',
    sticker: { background: '#ffd23f', ink: '#4a3600' },
    patternOpacity: 0.3,
    pattern: `<circle cx="18" cy="22" r="1.5" fill="#fff"/><circle cx="90" cy="60" r="1.2" fill="#fff"/><circle cx="50" cy="100" r="1.8" fill="#fff"/>${sparkle(75, 27, 9, '#ffd23f')}`,
    band: [
      burst(170, 42, 34, '#ffd23f'),
      burst(400, 30, 24, '#ff7aa8', 12),
      burst(610, 58, 18, '#ffffff', 10),
      burst(790, 40, 38, '#4fd1c5', 16),
      burst(1040, 34, 28, '#ffd23f'),
      '<path d="M0 120V102Q200 90 400 100T800 98T1200 102V120Z" fill="#070e24"/>',
      ...[[60, 104, 0.8], [250, 102, 0.6], [880, 101, 0.9], [1150, 104, 0.7]].map(([x, y, scale]) => tree(x, y, scale, '#070e24')),
      cabin(470, 100, '#070e24'),
      cabin(530, 102, '#070e24'),
      cabin(980, 100, '#070e24'),
    ].join(''),
  },
  carnaval: {
    background: 'linear-gradient(160deg, #6a0f3c 0%, #9b1b30 100%)',
    ink: '#ffffff',
    sticker: { background: '#ffd23f', ink: '#4a3600' },
    patternOpacity: 0.35,
    pattern: [confetti(10, 14, 25, '#ffd23f'), confetti(70, 40, -35, '#3ccf6e'), confetti(95, 95, 60, '#7fd3ff'), '<circle cx="40" cy="80" r="3" fill="#fff"/><circle cx="100" cy="20" r="2.5" fill="#ffd23f"/>'].join(''),
    band: [
      garland(25, { top: 4, sag: 16, line: '#ffffff' }, (x, y, index) => `<path d="M${round(x - 17)} ${y}h34l-17 30z" fill="${['#ffd23f', '#3ccf6e', '#ffffff'][index % 3]}"/>`),
      ...[['#ffd23f', 78], ['#3ccf6e', 94], ['#ffffff', 110]].map(
        ([colour, y], index) => `<path d="M-20 ${y} ${Array.from({ length: 13 }, (_, step) => `Q${step * 100 + 30} ${y + (step % 2 ? -14 : 14) + index * 2} ${step * 100 + 80} ${y}`).join(' ')}" fill="none" stroke="${colour}" stroke-width="5" stroke-linecap="round" opacity=".9"/>`,
      ),
    ].join(''),
  },
  voorjaarsvakantie: {
    background: 'linear-gradient(160deg, #1d5f8f 0%, #2a7a52 100%)',
    ink: '#ffffff',
    sticker: { background: '#ffb3d1', ink: '#5a0f33' },
    patternOpacity: 0.2,
    pattern: [[26, 30, '#ffffff'], [88, 84, '#ffd23f']]
      .map(([x, y, colour]) => `${[0, 72, 144, 216, 288].map((angle) => `<circle cx="${round(x + 5 * Math.cos((angle * Math.PI) / 180))}" cy="${round(y + 5 * Math.sin((angle * Math.PI) / 180))}" r="4" fill="${colour}"/>`).join('')}<circle cx="${x}" cy="${y}" r="2.5" fill="#ff7a45"/>`)
      .join(''),
    band: [
      '<path d="M0 120V98Q200 80 420 94T840 90T1200 96V120Z" fill="#1f6b45"/>',
      ...Array.from({ length: 30 }, (_, index) => tulip(20 + index * 40, 44 + ((index * 17) % 5) * 7, TULIPS[(index * 3) % TULIPS.length])),
      '<path d="M0 120V108Q300 98 600 106T1200 104V120Z" fill="#2e8a57"/>',
    ].join(''),
  },
};
