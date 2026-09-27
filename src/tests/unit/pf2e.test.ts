import { describe, expect, it } from 'vitest';
import { createPf2eAdapter } from '@/adapters/pf2e';

const names: Record<string, string> = {
  'Scene.s.Token.t': 'Goblin Warrior',
  'Actor.a': 'Goblin (base)',
  'Actor.v.Item.i': 'Longsword',
};
const adapter = createPf2eAdapter((uuid) => names[uuid] ?? null);
const facet = (key: string) => adapter.facets.find((f) => f.key === key)!;

const attack = {
  flags: {
    pf2e: {
      context: {
        type: 'attack-roll',
        outcome: 'criticalSuccess',
        target: { actor: 'Actor.a', token: 'Scene.s.Token.t' },
        traits: ['attack', 'manipulate'],
      },
      origin: { uuid: 'Actor.v.Item.i' },
    },
  },
};

const damage = {
  flags: {
    pf2e: {
      context: { type: 'damage-roll', outcome: 'success', target: { actor: 'Actor.a' } },
      damageRoll: { types: { slashing: {}, fire: {} }, traits: ['attack', 'fire'] },
    },
  },
};

describe('pf2e adapter', () => {
  it('reads roll type and degree of success from the check context', () => {
    expect(facet('pf2e.rollType').values(attack)).toEqual(['attack-roll']);
    expect(facet('pf2e.outcome').values(attack)).toEqual(['criticalSuccess']);
  });

  it('names the target by token before actor', () => {
    expect(facet('pf2e.target').values(attack)).toEqual(['Goblin Warrior']);
    expect(facet('pf2e.target').values(damage)).toEqual(['Goblin (base)']);
  });

  it('names the originating item', () => {
    expect(facet('pf2e.item').values(attack)).toEqual(['Longsword']);
  });

  it('lists damage types and merges traits without duplicates', () => {
    expect(facet('pf2e.damageType').values(damage)).toEqual(['slashing', 'fire']);
    expect(facet('pf2e.trait').values(damage)).toEqual(['attack', 'fire']);
  });

  it('yields nothing for messages without PF2e flags', () => {
    for (const f of adapter.facets) expect(f.values({ flags: {} })).toEqual([]);
  });

  it('skips uuids that no longer resolve', () => {
    expect(facet('pf2e.item').values({ flags: { pf2e: { origin: { uuid: 'Actor.gone.Item.x' } } } })).toEqual([]);
  });
});

describe('pf2e spell kind', () => {
  const kind = facet('kind');

  it('tags spell cards, casts and spell rolls as spell', () => {
    expect(kind.values({ flags: { pf2e: { origin: { type: 'spell' } } } })).toEqual(['spell']);
    expect(kind.values({ flags: { pf2e: { casting: { id: 'x' } } } })).toEqual(['spell']);
    expect(kind.values({ flags: { pf2e: { context: { type: 'spell-cast' } } } })).toEqual(['spell']);
  });

  it('leaves weapon strikes alone', () => {
    expect(kind.values(attack)).toEqual([]);
  });
});

describe('pf2e check facet', () => {
  const check = facet('pf2e.check');

  it('reads the rolled statistic from the stored roll options', () => {
    const recovery = {
      flags: {
        pf2e: {
          context: {
            type: 'flat-check',
            options: ['check:type:flat', 'check:statistic:dying-recovery', 'self:condition:dying'],
          },
        },
      },
    };
    expect(check.values(recovery)).toEqual(['dying-recovery']);
  });

  it('ignores the base-statistic option', () => {
    const save = {
      flags: { pf2e: { context: { options: ['check:statistic:reflex', 'check:statistic:base:reflex'] } } },
    };
    expect(check.values(save)).toEqual(['reflex']);
  });
});
