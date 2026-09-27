import { describe, expect, it } from 'vitest';
import { currentToken, suggest, type FacetEntry } from '@/search/suggest';

const entries: FacetEntry[] = [
  {
    key: 'kind',
    label: 'Type',
    options: [
      { value: 'roll', label: 'Roll', count: 30 },
      { value: 'spell', label: 'Spell', count: 12 },
    ],
  },
  {
    key: 'pf2e.item',
    label: 'Item or spell',
    options: [
      { value: 'Speak with Animals', label: 'Speak with Animals', count: 1 },
      { value: 'Fireball', label: 'Fireball', count: 5 },
    ],
  },
  {
    key: 'pf2e.check',
    label: 'Check',
    options: [{ value: 'dying-recovery', label: 'Recovery check (dying)', count: 3 }],
  },
];

const labels = (token: string, selected: Record<string, string[]> = {}) =>
  suggest(token, entries, selected).map((s) => `${s.facetLabel}: ${s.valueLabel}`);

describe('currentToken', () => {
  it('returns the last word and where it starts', () => {
    expect(currentToken('goblin spe')).toEqual({ text: 'spe', start: 7 });
  });

  it('is null after a space or inside an open quote', () => {
    expect(currentToken('goblin ')).toBeNull();
    expect(currentToken('"magic missi')).toBeNull();
    expect(currentToken('')).toBeNull();
  });
});

describe('suggest', () => {
  it('ranks prefix matches first, then by count', () => {
    expect(labels('sp')).toEqual(['Type: Spell', 'Item or spell: Speak with Animals']);
  });

  it('matches the start of later words', () => {
    expect(labels('recov')).toEqual(['Check: Recovery check (dying)']);
    expect(labels('dying')).toEqual(['Check: Recovery check (dying)']);
  });

  it('waits for two characters', () => {
    expect(labels('s')).toEqual([]);
  });

  it('narrows to a facet with facet:value', () => {
    expect(labels('type:')).toEqual(['Type: Roll', 'Type: Spell']);
    expect(labels('item:fi')).toEqual(['Item or spell: Fireball']);
  });

  it('skips values already selected', () => {
    expect(labels('sp', { kind: ['spell'] })).toEqual(['Item or spell: Speak with Animals']);
  });
});
