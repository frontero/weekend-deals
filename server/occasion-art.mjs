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

const egg = (x, y, scale, colour, stripe) =>
  `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M0-16C9-16 13-4 13 3A13 13 0 0 1-13 3C-13-4-9-16 0-16Z" fill="${colour}"/><path d="M-12-2Q-6-7 0-2T12-2" fill="none" stroke="${stripe}" stroke-width="3" stroke-linecap="round"/></g>`;
const daisy = (x, y, scale, petals = '#ffffff') =>
  `<g transform="translate(${x} ${y}) scale(${scale})">${[0, 60, 120, 180, 240, 300].map((angle) => `<ellipse cx="0" cy="-7" rx="3.2" ry="6" fill="${petals}" transform="rotate(${angle})"/>`).join('')}<circle r="3.4" fill="#ffd23f"/></g>`;
const stemmedDaisy = (x, height, scale) => `<path d="M${x} 120V${120 - height}" stroke="#14532d" stroke-width="2.5"/>${daisy(x, 120 - height, scale)}`;
const leaf = (x, y, angle, colour, scale = 1) =>
  `<path transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})" d="M0-12C8-8 8 6 0 12C-8 6-8-8 0-12ZM0-12V15" fill="${colour}" stroke="${colour}" stroke-width="1.2"/>`;
const roundTree = (x, y, scale, colour) =>
  `<g transform="translate(${x} ${y}) scale(${scale})"><rect x="-3" y="-14" width="6" height="16" fill="#4a2a12"/><circle cx="0" cy="-30" r="20" fill="${colour}"/><circle cx="-13" cy="-20" r="12" fill="${colour}"/><circle cx="13" cy="-20" r="12" fill="${colour}"/></g>`;
const mushroom = (x, y, scale) =>
  `<g transform="translate(${x} ${y}) scale(${scale})"><rect x="-3" y="-8" width="6" height="10" rx="2" fill="#f4ead8"/><path d="M-11-7A11 9 0 0 1 11-7Z" fill="#d62839"/><circle cx="-4" cy="-11" r="1.6" fill="#fff"/><circle cx="4" cy="-10" r="1.3" fill="#fff"/></g>`;
const sun = (x, y, radius, colour) =>
  `<circle cx="${x}" cy="${y}" r="${radius}" fill="${colour}"/>${Array.from({ length: 12 }, (_, index) => {
    const angle = (index / 12) * 2 * Math.PI;
    return `<line x1="${round(x + Math.cos(angle) * (radius + 6))}" y1="${round(y + Math.sin(angle) * (radius + 6))}" x2="${round(x + Math.cos(angle) * (radius + 16))}" y2="${round(y + Math.sin(angle) * (radius + 16))}" stroke="${colour}" stroke-width="3" stroke-linecap="round"/>`;
  }).join('')}`;
const cloud = (x, y, scale) => `<g transform="translate(${x} ${y}) scale(${scale})" fill="#ffffff" opacity=".9"><circle r="12"/><circle cx="14" cy="-6" r="15"/><circle cx="32" cy="0" r="12"/><rect x="0" y="0" width="32" height="12"/></g>`;
const EGGS = [['#ffd23f', '#ff7a45'], ['#ff8fb8', '#ffffff'], ['#7fd3ff', '#1d5f8f'], ['#c084fc', '#ffd23f'], ['#ffffff', '#ff5c8a']];
const AUTUMN = ['#e8590c', '#f59f00', '#c92a2a', '#ffd23f'];

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
  pasen: {
    background: 'linear-gradient(160deg, #6b3fa0 0%, #2f7d4b 100%)',
    ink: '#ffffff',
    sticker: { background: '#ffd23f', ink: '#4a3600' },
    patternOpacity: 0.22,
    pattern: `${egg(28, 34, 0.6, '#ffffff', '#ffd23f')}${egg(88, 86, 0.5, '#ffd23f', '#ffffff')}<circle cx="80" cy="22" r="2" fill="#fff"/><circle cx="24" cy="96" r="1.8" fill="#fff"/>`,
    band: [
      '<path d="M0 120V96Q200 80 420 92T840 88T1200 94V120Z" fill="#1f6b45"/>',
      ...Array.from({ length: 20 }, (_, index) => egg(40 + index * 59, 96 + ((index * 7) % 3) * 4, 1 + ((index * 5) % 3) * 0.15, ...EGGS[index % EGGS.length])),
      ...Array.from({ length: 60 }, (_, index) => `<path d="M${10 + index * 20} 120l4-${16 + ((index * 13) % 4) * 4} 4 ${16 + ((index * 13) % 4) * 4}z" fill="#2e8a57"/>`),
    ].join(''),
  },
  pinksteren: {
    background: 'linear-gradient(160deg, #14606b 0%, #1f7a4d 100%)',
    ink: '#ffffff',
    sticker: { background: '#ffffff', ink: '#14606b' },
    patternOpacity: 0.2,
    pattern: `${daisy(28, 30, 0.9)}${daisy(88, 84, 0.7)}`,
    band: [
      '<path d="M0 120V98Q200 82 420 94T840 90T1200 96V120Z" fill="#155e3b"/>',
      ...Array.from({ length: 34 }, (_, index) => stemmedDaisy(18 + index * 35, 34 + ((index * 11) % 5) * 8, 1.1 + ((index * 7) % 3) * 0.2)),
      '<path d="M0 120V110Q300 100 600 108T1200 106V120Z" fill="#2e8a57"/>',
    ].join(''),
  },
  meivakantie: {
    background: 'linear-gradient(160deg, #1763a6 0%, #1d7f8c 100%)',
    ink: '#ffffff',
    sticker: { background: '#ff9f1c', ink: '#3d2200' },
    patternOpacity: 0.16,
    pattern: `${cloud(14, 30, 0.6)}${cloud(70, 88, 0.45)}`,
    band: [
      sun(1010, 48, 26, '#ffd23f'),
      cloud(140, 40, 1.3),
      cloud(520, 28, 1),
      cloud(760, 52, 0.8),
      '<path d="M0 120V96Q200 78 420 92T840 86T1200 94V120Z" fill="#1f7a45"/>',
      ...[[90, 98, 0.9], [330, 94, 0.7], [640, 92, 1], [1120, 96, 0.8]].map(([x, y, scale]) => roundTree(x, y, scale, '#2e9e5b')),
      cabin(430, 96, '#f4ead8'),
      cabin(880, 94, '#f4ead8'),
      '<path d="M0 120V108Q300 98 600 106T1200 104V120Z" fill="#2e8a57"/>',
    ].join(''),
  },
  hemelvaart: {
    background: 'linear-gradient(160deg, #2b2f77 0%, #7a3b69 100%)',
    ink: '#ffffff',
    sticker: { background: '#ffd23f', ink: '#4a3600' },
    patternOpacity: 0.25,
    pattern: `<circle cx="20" cy="24" r="1.5" fill="#fff"/><circle cx="92" cy="62" r="1.2" fill="#fff"/><circle cx="52" cy="100" r="1.6" fill="#fff"/>${sparkle(78, 26, 7, '#ffd9a0')}`,
    band: [
      '<circle cx="600" cy="104" r="64" fill="#ffb347" opacity=".35"/>',
      sun(600, 104, 34, '#ffd23f'),
      '<path d="M0 120V96Q220 76 440 92T860 90T1200 96V120Z" fill="#231942"/>',
      ...[[80, 98, 0.9], [150, 100, 0.6], [360, 94, 0.7], [900, 94, 0.8], [1090, 98, 1]].map(([x, y, scale]) => tree(x, y, scale, '#231942')),
      // A bicycle on the hill: dauwtrappen, the early ride of Ascension morning.
      '<g transform="translate(760 88)" fill="none" stroke="#231942" stroke-width="3" stroke-linecap="round"><circle cx="0" cy="0" r="10"/><circle cx="34" cy="0" r="10"/><path d="M0 0l11-17h14l9 17M11-17l7 17 9-17M9-21h6M25-17l-2-6h6"/></g>',
    ].join(''),
  },
  herfstvakantie: {
    background: 'linear-gradient(160deg, #7a2e12 0%, #a4491a 100%)',
    ink: '#ffffff',
    sticker: { background: '#ffd23f', ink: '#4a3600' },
    patternOpacity: 0.3,
    pattern: `${leaf(26, 30, 30, '#ffd23f', 0.8)}${leaf(88, 82, -40, '#ffb347', 0.7)}${leaf(100, 22, 70, '#ff7a45', 0.5)}`,
    band: [
      ...Array.from({ length: 16 }, (_, index) => leaf(40 + index * 75, 16 + ((index * 29) % 5) * 9, (index * 47) % 360, AUTUMN[index % AUTUMN.length], 0.9)),
      '<path d="M0 120V98Q200 82 420 94T840 90T1200 96V120Z" fill="#4a1d0b"/>',
      ...[[70, 100, 1, 0], [200, 98, 0.7, 1], [420, 96, 0.9, 2], [640, 94, 0.75, 3], [820, 94, 1, 1], [1010, 96, 0.8, 0], [1140, 98, 1, 2]].map(([x, y, scale, colour]) => roundTree(x, y, scale, AUTUMN[colour])),
      ...[[300, 108, 1], [540, 106, 0.8], [930, 106, 1.1]].map(([x, y, scale]) => mushroom(x, y, scale)),
    ].join(''),
  },
  zomervakantie: {
    background: 'linear-gradient(160deg, #0b63a0 0%, #0c7f86 100%)',
    ink: '#ffffff',
    sticker: { background: '#ffd23f', ink: '#4a3600' },
    patternOpacity: 0.18,
    pattern: '<path d="M8 30q13-10 26 0t26 0M60 90q13-10 26 0t26 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
    band: [
      sun(170, 44, 26, '#ffd23f'),
      cloud(520, 30, 0.9),
      cloud(900, 44, 1.1),
      '<path d="M0 120V84Q150 74 300 84T600 84T900 84T1200 84V120Z" fill="#0a5a8a"/>',
      '<path d="M0 120V94Q150 84 300 94T600 94T900 94T1200 94V120Z" fill="#1487b8"/>',
      // A sailing boat on the water.
      '<g transform="translate(700 84)"><path d="M-22 0h44l-8 10h-28z" fill="#ffffff"/><path d="M0-34V0M2-32l20 28H2z" fill="#ff7657" stroke="#ffffff" stroke-width="2"/></g>',
      '<path d="M0 120V106Q300 96 600 104T1200 102V120Z" fill="#f4d9a0"/>',
      ...[[330, 106, '#ff7657'], [520, 108, '#ffd23f'], [980, 106, '#ff7657'], [1110, 107, '#ffffff']].map(
        ([x, y, colour]) => `<g transform="translate(${x} ${y})"><path d="M0 0V-26" stroke="#7a4b00" stroke-width="2.5"/><path d="M-22-24A22 16 0 0 1 22-24Z" fill="${colour}"/></g>`,
      ),
    ].join(''),
  },
  kerstvakantie: {
    background: 'linear-gradient(160deg, #123a5c 0%, #1b5a7a 100%)',
    ink: '#ffffff',
    sticker: { background: '#ffffff', ink: '#123a5c' },
    patternOpacity: 0.2,
    pattern: `${snowflake(24, 28, 1)}${snowflake(84, 78, 0.7)}<circle cx="70" cy="20" r="2" fill="#fff"/><circle cx="20" cy="95" r="1.6" fill="#fff"/><circle cx="105" cy="45" r="1.4" fill="#fff"/>`,
    band: [
      '<path d="M0 120V94Q150 72 300 90T600 88T900 86T1200 92V120Z" fill="#eef6fb"/>',
      ...[[90, 98, 1], [150, 102, 0.7], [420, 96, 0.8], [820, 94, 0.9], [880, 98, 0.6], [1120, 98, 1]].map(([x, y, scale], index) => tree(x, y, scale, index % 2 ? '#0f2f49' : '#1e6f6a')),
      cabin(250, 96, '#7a3b2e'),
      cabin(980, 94, '#7a3b2e'),
      // A snowman between the trees.
      '<g transform="translate(610 96)"><circle cy="-8" r="14" fill="#ffffff"/><circle cy="-30" r="10" fill="#ffffff"/><circle cx="-3" cy="-32" r="1.4" fill="#123a5c"/><circle cx="3" cy="-32" r="1.4" fill="#123a5c"/><path d="M0-29l9 2-9 2z" fill="#ff7657"/><path d="M-9-39h18v-3h-4v-9h-10v9h-4z" fill="#123a5c"/><path d="M-10-22q10 5 20 0" fill="none" stroke="#d62839" stroke-width="3" stroke-linecap="round"/></g>',
    ].join(''),
  },
};
