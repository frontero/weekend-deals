/** How full each of the five stars is, e.g. 4.3 → [1, 1, 1, 1, 0.3]. */
export function starFills(rating) {
  return Array.from({ length: 5 }, (_, index) => Math.round(Math.min(1, Math.max(0, rating - index)) * 10) / 10);
}
