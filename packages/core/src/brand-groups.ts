/**
 * docs/product/NEXT_FEATURES_SPEC.md §1 — pure helpers for brand groups,
 * kept free of I/O so the maths the dashboard shows can be tested exactly.
 */

export const BRAND_GROUP_KINDS = ["own", "competitor", "category"] as const;
export type BrandGroupKindValue = (typeof BRAND_GROUP_KINDS)[number];

/**
 * Colour *keys* (not hex): the first slots of the categorical chart
 * palette, in its fixed order. A group's colour follows the group, never
 * its rank, so re-sorting or filtering groups must not repaint the rest.
 */
export const BRAND_GROUP_COLORS = [
  "blue",
  "orange",
  "aqua",
  "yellow",
  "magenta",
  "green",
  "violet",
  "red",
] as const;
export type BrandGroupColor = (typeof BRAND_GROUP_COLORS)[number];

/** Picks the first palette colour no live group is using yet (wraps when all 8 are taken). */
export function nextGroupColor(used: readonly string[]): BrandGroupColor {
  const free = BRAND_GROUP_COLORS.find((color) => !used.includes(color));
  return free ?? BRAND_GROUP_COLORS[used.length % BRAND_GROUP_COLORS.length]!;
}

export type GroupVolume = { totalMentions: number };

/**
 * Share of voice: a group's mentions ÷ the sum of mentions across every
 * group being compared, as a fraction in [0, 1]. Returns `null` for every
 * group when nobody was mentioned at all — there is no share to report,
 * and showing 0 % for everyone would be a made-up number.
 */
export function shareOfVoice<T extends GroupVolume>(
  groups: readonly T[],
): (T & { shareOfVoice: number | null })[] {
  const denominator = groups.reduce((sum, group) => sum + group.totalMentions, 0);
  return groups.map((group) => ({
    ...group,
    shareOfVoice: denominator === 0 ? null : group.totalMentions / denominator,
  }));
}

/** (positive − negative) ÷ total, −1..1, or `null` with no mentions. */
export function netSentiment(counts: {
  positive: number;
  negative: number;
  totalMentions: number;
}): number | null {
  if (counts.totalMentions === 0) return null;
  return (counts.positive - counts.negative) / counts.totalMentions;
}
