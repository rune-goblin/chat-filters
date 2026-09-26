import { parseTerms } from './text';
import type { MessageRecord, SearchQuery, TimeRange } from './types';

const HOUR = 60 * 60 * 1000;

export function timeFloor(range: TimeRange, now = Date.now()): number {
  switch (range) {
    case 'hour':
      return now - HOUR;
    case 'today': {
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);
      return midnight.getTime();
    }
    case 'week':
      return now - 7 * 24 * HOUR;
    case 'all':
      return -Infinity;
  }
}

export function filterRecords(records: readonly MessageRecord[], query: SearchQuery, now = Date.now()): MessageRecord[] {
  const terms = parseTerms(query.text);
  const floor = timeFloor(query.time, now);
  const active = Object.entries(query.facets).filter(([, selected]) => selected.length > 0);

  return records.filter((record) => {
    if (record.timestamp < floor) return false;
    for (const [key, selected] of active) {
      const values = record.facets[key];
      if (!values?.some((v) => selected.includes(v))) return false;
    }
    return terms.every((term) => record.haystack.includes(term));
  });
}

export interface FacetOption {
  value: string;
  count: number;
}

/** Distinct values of one facet across `records`, most frequent first. */
export function facetOptions(records: readonly MessageRecord[], key: string): FacetOption[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const value of record.facets[key] ?? []) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
