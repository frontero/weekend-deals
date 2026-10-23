import { fetchWithRetry } from './http.mjs';

// Any Landal search page carries the full list of filter options.
const FILTER_PAGE_URL = 'https://www.landal.nl/vakanties/last-minutes';
const PARK_SECTION = 'Park';
const ACCOMMODATION_SECTION = 'Accommodatie';
// The travel party already decides the accommodation size.
const SKIPPED_ACCOMMODATION_GROUPS = ['Accommodatie grootte'];
// Pets belong in the travel party: only then does Landal add the pet surcharge to the price.
const PET_OPTION = /^Huisdieren toegestaan/;
// Landal matches any of the ticked options in these groups and all of them elsewhere (checked against its search).
const ANY_OF_GROUPS = ['Accommodatie type', 'Comfort en Luxe'];

function findSection(categories, title) {
  for (const category of categories ?? []) {
    if (category.title === title) return category;
    const nested = findSection(category.categories, title);
    if (nested) return nested;
  }
  return null;
}

function toGroups(section) {
  return section.categories
    .filter((category) => category.options?.length)
    .map((category) => ({
      name: category.title,
      anyOf: ANY_OF_GROUPS.includes(category.title),
      options: category.options.map((option) => ({ id: option.id, name: option.name.trim() })),
    }));
}

/** Park facilities ("Zwempret", "Kids", …) and accommodation features as Landal shows them in its search filters. */
export function parseFilterGroups(html) {
  const blocks = html.matchAll(/<script type="json\/options">([\s\S]*?)<\/script>/g);
  const filterOptions = [...blocks].map(([, json]) => json).find((json) => json.includes('facet-categories'));
  const sections = filterOptions ? JSON.parse(filterOptions)['facet-categories'] : [];
  const park = findSection(sections, PARK_SECTION);
  const accommodation = findSection(sections, ACCOMMODATION_SECTION);
  if (!park || !accommodation) throw new Error('Could not find the park and accommodation filters on the Landal page');

  return {
    park: toGroups(park),
    accommodation: toGroups(accommodation)
      .filter((group) => !SKIPPED_ACCOMMODATION_GROUPS.includes(group.name))
      .map((group) => ({ ...group, options: group.options.filter((option) => !PET_OPTION.test(option.name)) }))
      .filter((group) => group.options.length),
  };
}

export async function fetchFilterGroups() {
  const response = await fetchWithRetry(FILTER_PAGE_URL);
  return parseFilterGroups(await response.text());
}
