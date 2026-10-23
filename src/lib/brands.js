// How each brand looks on screen. Dot colours follow the chart palette's fixed order, so a brand keeps its colour.
const BRANDS = {
  landal: { name: 'Landal', dot: '#2a78d6' },
  roompot: { name: 'Roompot', dot: '#eb6834' },
  summio: { name: 'Summio', dot: '#1baf7a' },
  dormio: { name: 'Dormio', dot: '#eda100' },
  topparken: { name: 'Topparken', dot: '#e87ba4' },
  molecaten: { name: 'Molecaten', dot: '#008300' },
  hofvansaksen: { name: 'Hof van Saksen', dot: '#6250d6' },
  europarcs: { name: 'EuroParcs', dot: '#e34948' },
  centerparcs: { name: 'Center Parcs', dot: '#898781' },
};

export const brandName = (id) => BRANDS[id]?.name ?? id;
export const brandDot = (id) => BRANDS[id]?.dot ?? '#898781';
