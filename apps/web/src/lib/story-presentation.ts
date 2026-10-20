/** Group only known article/cluster identities, never title similarity alone. Input is already tenant-scoped and newest first. */
export function groupStoryRows<T extends { article: { id: string; storyClusterId?: string | null } }>(rows: T[], limit: number) {
  const groups = new Map<string, { representative: T; matches: number }>();
  for (const row of rows) {
    const key = row.article.storyClusterId ? `cluster:${row.article.storyClusterId}` : `article:${row.article.id}`;
    const existing = groups.get(key);
    if (existing) existing.matches += 1;
    else groups.set(key, { representative: row, matches: 1 });
  }
  return [...groups.values()].slice(0, limit);
}

export function sentimentCoverage(summary: { positive: number; neutral: number; negative: number; totalMentions: number }) {
  const classified = summary.positive + summary.neutral + summary.negative;
  return {
    classified,
    unclassified: Math.max(0, summary.totalMentions - classified),
    percent: summary.totalMentions > 0 ? Math.round(classified / summary.totalMentions * 100) : null,
  };
}

/** Unanalyzed matches are excluded from the denominator, never treated as neutral. */
export function sentimentNetScore(counts: { positive: number; neutral: number; negative: number }) {
  const classified = counts.positive + counts.neutral + counts.negative;
  return classified === 0 ? null : Math.round((counts.positive - counts.negative) / classified * 100);
}
