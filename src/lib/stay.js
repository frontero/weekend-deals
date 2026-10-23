const count = (amount, one, many) => `${amount} ${amount === 1 ? one : many}`;

function joinAnd(parts) {
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} en ${parts.at(-1)}` : parts[0];
}

export function describeTravelParty({ adults, children = 0, pets = 0 }) {
  return joinAnd(
    [
      count(adults, 'volwassene', 'volwassenen'),
      children ? count(children, 'kind', 'kinderen') : null,
      pets ? count(pets, 'huisdier', 'huisdieren') : null,
    ].filter(Boolean),
  );
}

/** "4 volw. + 2 kind. + 1 huisdier": the party a price is for, short enough for next to a price. */
export function describePartyShort({ adults, children = 0, pets = 0 }) {
  return [
    `${adults} volw.`,
    children ? `${children} kind.` : null,
    pets ? count(pets, 'huisdier', 'huisdieren') : null,
  ]
    .filter(Boolean)
    .join(' + ');
}

/** Readable requirements, e.g. ["Bungalow of Lodge", "Sauna"]; any-of groups collapse into one "of" item. */
export function describeAccommodation(featureIds, groups) {
  return groups.flatMap((group) => {
    const names = group.options.filter((option) => featureIds.includes(option.id)).map((option) => option.name);
    if (!names.length) return [];
    return group.anyOf ? [names.join(' of ')] : names;
  });
}
