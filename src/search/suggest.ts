export interface FacetEntry {
  key: string;
  label: string;
  options: { value: string; label: string; count: number }[];
}

export interface Suggestion {
  key: string;
  value: string;
  facetLabel: string;
  valueLabel: string;
  count: number;
}

/** A dropdown row: keep the typed words as a text search, or turn them into a filter. */
export type Row = { kind: 'text'; text: string; count: number } | ({ kind: 'filter' } & Suggestion);

/**
 * The filters, then the text search as a fallback, so the typed words can stay a plain text
 * search. A `facet:value` query gets only filters; with no filter to choose, the dropdown stays
 * closed.
 */
export function suggestionRows(query: string, textCount: number, suggestions: readonly Suggestion[]): Row[] {
  const filters = suggestions.map((s) => ({ kind: 'filter' as const, ...s }));
  if (!filters.length || currentToken(query)?.text.includes(':')) return filters;
  return [...filters, { kind: 'text', text: query.trim(), count: textCount }];
}

export interface Token {
  text: string;
  start: number;
}

/** The word being typed at the end of the query, unless it sits inside an open quote. */
export function currentToken(query: string): Token | null {
  if (!query || /\s$/.test(query)) return null;
  if ((query.match(/"/g) ?? []).length % 2 === 1) return null;
  const start = query.search(/\S+$/);
  return { text: query.slice(start), start };
}

function rank(label: string, needle: string): number {
  const lower = label.toLowerCase();
  if (lower.startsWith(needle)) return 0;
  if (lower.includes(` ${needle}`) || lower.includes(`(${needle}`)) return 1;
  if (lower.includes(needle)) return 2;
  return -1;
}

/**
 * Filter values whose label matches `token`. `facet:value` narrows to facets whose label
 * starts with the part before the colon. Already-selected values are skipped.
 */
export function suggest(
  token: string,
  entries: readonly FacetEntry[],
  selected: Record<string, string[]>,
  limit = 8,
): Suggestion[] {
  const colon = token.indexOf(':');
  const facetNeedle = colon >= 0 ? token.slice(0, colon).toLowerCase() : '';
  const needle = (colon >= 0 ? token.slice(colon + 1) : token).toLowerCase();
  if (colon < 0 && needle.length < 2) return [];

  const scored: (Suggestion & { rank: number })[] = [];
  for (const entry of entries) {
    if (facetNeedle && !entry.label.toLowerCase().startsWith(facetNeedle)) continue;
    for (const option of entry.options) {
      if (selected[entry.key]?.includes(option.value)) continue;
      const r = needle ? rank(option.label, needle) : 0;
      if (r < 0) continue;
      scored.push({
        key: entry.key,
        value: option.value,
        facetLabel: entry.label,
        valueLabel: option.label,
        count: option.count,
        rank: r,
      });
    }
  }
  return scored
    .sort((a, b) => a.rank - b.rank || b.count - a.count || a.valueLabel.localeCompare(b.valueLabel))
    .slice(0, limit)
    .map(({ rank: _, ...s }) => s);
}
