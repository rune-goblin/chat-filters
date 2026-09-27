import { describe, expect, it } from 'vitest';
import { mergeFacets } from '@/adapters';
import type { FacetDef } from '@/search/types';

type Msg = { tags: string[] };
const core: FacetDef<Msg>[] = [
  { key: 'kind', label: 'Type', values: (m) => m.tags.slice(0, 1), valueLabel: (v) => `core:${v}` },
];
const extra: FacetDef<Msg>[] = [
  { key: 'kind', label: 'ignored', values: (m) => (m.tags.includes('spell') ? ['spell'] : []) },
  { key: 'pf2e.outcome', label: 'Outcome', values: () => ['success'] },
];

describe('mergeFacets', () => {
  const merged = mergeFacets(core, extra);

  it('adds adapter values to a core facet with the same key', () => {
    const kind = merged.find((f) => f.key === 'kind')!;
    expect(kind.values({ tags: ['roll', 'spell'] })).toEqual(['roll', 'spell']);
    expect(kind.label).toBe('Type');
    expect(kind.valueLabel?.('spell')).toBe('core:spell');
  });

  it('keeps a merged facet off blind cards unless both sides are header facets', () => {
    const header = mergeFacets([{ ...core[0], header: true }], extra);
    expect(header.find((f) => f.key === 'kind')!.header).toBeFalsy();
  });

  it('appends facets with new keys', () => {
    expect(merged.map((f) => f.key)).toEqual(['kind', 'pf2e.outcome']);
  });
});
