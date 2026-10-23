// The app's own park facility filters. Each bundles what means the same to a visitor, whatever a provider calls
// it: Landal by its facet ids, Topparken and Molecaten by the names on their park pages. A park counts as having a
// filter when it has any of the bundled facilities. Distinct things stay apart (an indoor pool is no swimming
// paradise), near-duplicates go together (Landal's "Minishop" and "Supermarkt/parkshop" are both a shop).

const option = (id, name, landal, names = null) => ({ id, name, landal, names });

export const FACILITY_GROUPS = [
  {
    name: 'Zwemmen',
    options: [
      option('overdekt-zwembad', 'Overdekt zwembad', ['9299.16301'], /binnenzwembad|overdekt (zwem)?bad|indoor ?zwembad/),
      option('zwemparadijs', 'Subtropisch zwemparadijs', ['9299.16303'], /zwemparadijs|subtropisch/),
      option('openluchtzwembad', 'Openluchtzwembad', ['9299.16302'], /buitenzwembad|openluchtzwembad|buitenbad/),
      option('peuterbad', 'Peuter- of kinderbad', ['9299.16305'], /peuterbad|kinderbad|pierenbad/),
      option('natuurlijk-zwemwater', 'Natuurlijk zwemwater of zwemmeer', ['9299.16304', '9299.2031485'], /zwemmeer|zwemvijver|natuurbad|zwemplas|natuurlijk zwemwater/),
      option('waterspeeltuin', 'Waterspeeltuin', ['9299.2031486'], /waterspeel/),
      option('huisjes-met-privezwembad', 'Huisjes met privézwembad', ['9299.2193658'], /priv[eé] ?zwembad/),
    ],
  },
  {
    name: 'Kinderen',
    options: [
      option('speeltuin', 'Speeltuin', ['9284.16376'], /^(?!.*(indoor|binnen|water)).*(^|\s)speeltuin/),
      option('indoor-speelparadijs', 'Indoor speelparadijs', ['9284.16380', '9284.16379'], /indoor ?speel|binnenspeel|speelparadijs/),
      option('kinderboerderij', 'Kinderboerderij of dierenweide', ['9284.16375'], /kinderboerderij|dierenwei/),
      option('animatie', 'Animatieprogramma', ['9284.16377', '9284.16378'], /animatie|entertainment/),
      // Bollo and Koos are the mascots of Landal and Roompot: to a visitor, a kids' club either way.
      option('kinderclub', 'Kinderclub', ['9284.16381', '9284.16382', '9284.2031478'], /kidsclub|kinderclub|miniclub/),
      option('amusementshal', 'Amusementshal of gameroom', ['9284.18433'], /amusementshal|speelhal|game ?room|arcade/),
    ],
  },
  {
    name: 'Eten en drinken',
    options: [
      option('restaurant', 'Restaurant', ['9280.16403'], /restaurant/),
      option('cafe', 'Café of bar', ['9280.16407'], /caf[eé]|(^|\s)bar(\s|$)|brasserie/),
      option('snackbar', 'Snackbar', ['9280.16408'], /snackbar|cafetaria/),
      option('winkel', 'Winkel of supermarkt', ['9280.16404', '9280.16405'], /supermarkt|winkel|parkshop|minimarkt|(^|\s)shop/),
    ],
  },
  {
    name: 'Sport en spel',
    options: [
      option('fietsverhuur', 'Fietsverhuur', ['9283.16387'], /fietsverhuur|fietsen? (te )?huur|stadsfiets|e-bike|kinderfiets/),
      option('minigolf', 'Minigolf of midgetgolf', ['9283.16384'], /minigolf|midgetgolf|adventure ?golf|crazy ?golf/),
      option('bowling', 'Bowling', ['9283.16389'], /bowling/),
      option('vissen', 'Vissen', ['9283.16390', '9283.2041729'], /vissen|visvijver|hengel|vismogelijk/),
      option('tennis', 'Tennis', ['9283.16388'], /^(?!.*tafel).*tennis/),
      option('watersport', 'Watersport', ['9283.16386'], /watersport|kano|(^|\s)sup(\s|$)|zeilen|surf|waterfiets|sloep|(^|\s)boot|jachthaven/),
      option('golfbaan', 'Golfbaan', ['9283.16385'], /\bgolfbaan\b|golfterrein/),
      option('padel', 'Padel', ['9283.2031482'], /padel/),
      option('squash', 'Squash', ['9283.16391'], /squash/),
      option('pumptrack', 'Pumptrack', ['9283.557763'], /pump ?track/),
      option('jeu-de-boules', 'Jeu de boules', ['9283.2168095'], /jeu[- ]de[- ]boule|p[eé]tanque/),
      option('sportveld', 'Sport- of speelveld', ['9283.2031481'], /sportveld|speelveld|voetbal|panna|basketbal|volleybal|trapveld|multisport/),
    ],
  },
  {
    name: 'Wellness',
    options: [
      option('sauna', 'Sauna op het park', ['9281.16416'], /sauna|stoombad/),
      option('wellness', 'Wellness', ['9281.16419'], /wellness/),
      option('massage-beauty', 'Massage of beautysalon', ['9281.16420', '9281.16421'], /massage|beauty|schoonheid/),
      option('fitness', 'Fitness', ['9281.16418'], /fitness|sportschool/),
      option('zonnebank', 'Zonnebank op het park', ['9281.16417'], /zonnebank|solarium/),
    ],
  },
  {
    // Only Landal tags where a park lies; other providers' parks do not show up under these.
    name: 'Ligging',
    options: [
      option('bos', 'In het bos', ['9275.9229']),
      option('kust', 'Aan de kust', ['9275.9231']),
      option('water', 'Aan het water', ['9275.9230']),
      option('landelijk', 'Landelijk', ['9275.9232']),
      option('heuvels', 'In het heuvelland', ['9275.133928']),
      option('bergen', 'In de bergen', ['9275.9234']),
      option('skigebied', 'In een skigebied', ['9275.132532']),
    ],
  },
  {
    name: 'Algemeen',
    options: [
      option('wifi', 'Gratis wifi', ['9271.39048', '9271.39049'], /wi-?fi/),
      option('laadpalen', 'Laadpalen op het park', ['9271.173009'], /laadpa(al|len)|laadpunt/),
      option('nieuw-park', 'Nieuw park', ['9271.39050']),
      // Fireworks are one choice: a park without any is also one with few.
      option('vuurwerkvrij', 'Vuurwerkvrij', ['9271.2162634', '9271.2370673']),
      option('vuurwerkluw', 'Vuurwerkluw of -vrij', ['9271.2162635', '9271.2162634', '9271.2370673']),
    ],
  },
];

const OPTIONS = FACILITY_GROUPS.flatMap((group) => group.options);

// Landal's own ids as filters used them before this list (in saved links and price alerts): the first filter
// that bundles it. "Vuurwerk toegestaan" has no filter any more.
const BY_LANDAL_ID = new Map();
for (const { id, landal } of OPTIONS) {
  for (const landalId of landal) if (!BY_LANDAL_ID.has(landalId)) BY_LANDAL_ID.set(landalId, id);
}
const OWN_IDS = new Set(OPTIONS.map((filter) => filter.id));

/** A filter id from before this list, or one of this list, as an id of this list; null when it has none. */
export function toFacilityId(id) {
  if (OWN_IDS.has(id)) return id;
  return BY_LANDAL_ID.get(id) ?? null;
}

/** The groups as the screen shows them: names and ids only. */
export const facilityGroups = () =>
  FACILITY_GROUPS.map(({ name, options }) => ({ name, anyOf: false, options: options.map(({ id, name }) => ({ id, name })) }));

/**
 * The filters a park has, from Landal's facet ids and the facility names on other providers' park pages.
 * @param landal Landal facet ids
 * @param names facility names as a park page lists them, e.g. "Verwarmd buitenzwembad"
 */
export function parkFacilities({ landal = [], names = [] }) {
  const lowered = names.map((name) => name.toLowerCase());
  return OPTIONS.filter(
    (filter) =>
      filter.landal.some((id) => landal.includes(id)) ||
      (filter.names && lowered.some((name) => new RegExp(filter.names.source, 'i').test(name))),
  ).map((filter) => filter.id);
}

// Accommodation requirements are Landal's own (they go to its search as they are); only their names say more
// clearly where they are, next to the park filters of the same kind.
const ACCOMMODATION_NAMES = {
  '9266.16393': 'Sauna in het huisje',
  '9266.16394': 'Zonnebank in het huisje',
  '9266.81442': 'Privézwembad bij het huisje',
  '9266.158274': 'Laadpaal bij het huisje',
};

export function accommodationGroups(groups) {
  return groups.map((group) => ({
    ...group,
    options: group.options.map((option) => ({ ...option, name: ACCOMMODATION_NAMES[option.id] ?? option.name })),
  }));
}
