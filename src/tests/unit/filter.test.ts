import { describe, expect, it } from 'vitest';
import { facetOptions, filterRecords, timeFloor } from '@/search/filter';
import type { MessageRecord, SearchQuery } from '@/search/types';

const NOW = new Date('2026-09-26T20:00:00').getTime();
const HOUR = 60 * 60 * 1000;

function record(id: string, haystack: string, facets: Record<string, string[]>, ago = 0): MessageRecord {
  return { id, timestamp: NOW - ago, speaker: '', haystack, preview: haystack, facets };
}

const records = [
  record('a', 'valeros strike longsword', { speaker: ['Valeros'], 'pf2e.outcome': ['criticalSuccess'] }),
  record('b', 'ezren fireball', { speaker: ['Ezren'], 'pf2e.outcome': ['success'] }, 2 * HOUR),
  record('c', 'valeros reflex save', { speaker: ['Valeros'], 'pf2e.outcome': ['failure'] }, 3 * 24 * HOUR),
];

const query = (q: Partial<SearchQuery>): SearchQuery => ({ text: '', time: 'all', facets: {}, ...q });
const ids = (q: Partial<SearchQuery>) => filterRecords(records, query(q), NOW).map((r) => r.id);

describe('filterRecords', () => {
  it('returns everything for an empty query', () => {
    expect(ids({})).toEqual(['a', 'b', 'c']);
  });

  it('requires every text term', () => {
    expect(ids({ text: 'valeros save' })).toEqual(['c']);
  });

  it('ORs values within a facet and ANDs across facets', () => {
    expect(ids({ facets: { 'pf2e.outcome': ['success', 'failure'] } })).toEqual(['b', 'c']);
    expect(ids({ facets: { 'pf2e.outcome': ['success', 'failure'], speaker: ['Valeros'] } })).toEqual(['c']);
  });

  it('ignores facets with nothing selected', () => {
    expect(ids({ facets: { speaker: [] } })).toEqual(['a', 'b', 'c']);
  });

  it('drops records older than the time range', () => {
    expect(ids({ time: 'hour' })).toEqual(['a']);
    expect(ids({ time: 'week' })).toEqual(['a', 'b', 'c']);
  });
});

describe('timeFloor', () => {
  it('starts "today" at local midnight', () => {
    expect(new Date(timeFloor('today', NOW)).getHours()).toBe(0);
  });
});

describe('facetOptions', () => {
  it('counts distinct values, sorted alphabetically', () => {
    expect(facetOptions(records, 'speaker')).toEqual([
      { value: 'Ezren', label: 'Ezren', count: 1 },
      { value: 'Valeros', label: 'Valeros', count: 2 },
    ]);
  });

  it('sorts by display label, ignoring case and ordering numbers numerically', () => {
    const labelled = [
      record('a', '', { item: ['x'] }),
      record('b', '', { item: ['y'] }),
      record('c', '', { item: ['z'] }),
      record('d', '', { item: ['z'] }),
    ];
    const label = (v: string) => ({ x: 'Strike 10', y: 'strike 2', z: 'Heal' })[v] ?? v;
    expect(facetOptions(labelled, 'item', label).map((o) => o.label)).toEqual(['Heal', 'strike 2', 'Strike 10']);
  });
});
