import { describe, expect, it } from 'vitest';
import { createPf2eAdapter, playerSeesElement, type FlaggedMessage, type Pf2eViewer } from '@/adapters/pf2e';

const names: Record<string, string> = {
  'Scene.s.Token.t': 'Goblin Warrior',
  'Actor.a': 'Goblin (base)',
  'Actor.v.Item.i': 'Longsword',
};
const adapter = createPf2eAdapter(
  (uuid) => names[uuid] ?? null,
  () => ({ isGM: true, showResults: false, tokenNames: true }),
);
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
  flags: { pf2e: { context: { type: 'damage-roll', outcome: 'success', target: { actor: 'Actor.a' } } } },
  rolls: [{ instances: [{ type: 'slashing' }, { type: 'fire' }, { type: 'fire' }], kinds: new Set(['damage']) }],
};

const actorWith = (conditions: string[], isOwner = true) => ({
  isOwner,
  getCondition: (slug: string) => (conditions.includes(slug) ? {} : null),
});

/** The card a persistent damage condition posts at the end of a turn: a damage roll with no check context. */
const burning = (speakerActor: FlaggedMessage['speakerActor'], options: Record<string, unknown> = { evaluatePersistent: true }) => ({
  flags: { pf2e: { origin: { uuid: 'Actor.v.Item.c' } } },
  rolls: [{ options, instances: [{ type: 'fire', persistent: true }], kinds: new Set(['damage']) }],
  speakerActor,
});

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

  it('lists each damage type of the rolled instances once', () => {
    expect(facet('pf2e.damageType').values(damage)).toEqual(['slashing', 'fire']);
    expect(facet('pf2e.damageType').values(attack)).toEqual([]);
  });

  it('reads traits from the check context', () => {
    expect(facet('pf2e.trait').values(attack)).toEqual(['attack', 'manipulate']);
  });

  it('files a damage roll posted without a check context under damage', () => {
    expect(facet('pf2e.rollType').values(burning(null))).toEqual(['damage-roll']);
    expect(facet('pf2e.rollType').values({ flags: {}, rolls: [{}] })).toEqual([]);
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

  it('tags a shared spell card and a cast card as spell', () => {
    expect(kind.values({ flags: { pf2e: { origin: { type: 'spell' } } } })).toEqual(['spell']);
    const cast = { origin: { type: 'spell' }, casting: { id: 'x' }, context: { type: 'spell-cast' } };
    expect(kind.values({ flags: { pf2e: cast } })).toEqual(['spell']);
  });

  it('leaves the rolls and effects a spell produces untagged', () => {
    for (const type of ['spell-attack-roll', 'damage-roll', 'saving-throw', 'self-effect']) {
      expect(kind.values({ flags: { pf2e: { origin: { type: 'spell' }, context: { type } } } })).toEqual([]);
    }
  });

  it('leaves weapon strikes alone', () => {
    expect(kind.values(attack)).toEqual([]);
  });
});

describe('pf2e buttons added at render', () => {
  const button = facet('pf2e.button');

  it('offers the recovery check while the speaker keeps that persistent damage', () => {
    expect(button.values(burning(actorWith(['persistent-damage-fire'])))).toEqual(['recovery-check']);
    expect(button.values(burning(actorWith(['persistent-damage-acid'])))).toEqual([]);
    expect(button.values(burning(actorWith([])))).toEqual([]);
    expect(button.values(burning(null))).toEqual([]);
  });

  it('offers the recovery check to an owner of the speaker only', () => {
    expect(button.values(burning(actorWith(['persistent-damage-fire'], false)))).toEqual([]);
  });

  it('leaves the strike that deals persistent damage without a recovery check', () => {
    expect(button.values(burning(actorWith(['persistent-damage-fire']), {}))).toEqual([]);
  });

  it('offers healing on a roll that heals', () => {
    const healing = { flags: {}, rolls: [{ instances: [{ type: 'untyped' }], kinds: new Set(['healing']) }] };
    expect(button.values(healing)).toEqual(['apply-healing']);
    expect(button.values(damage)).toEqual([]);
  });

  it('prints its labels and follows the world state', () => {
    expect(button.printed).toBe(true);
    expect(button.live).toBe(true);
    expect(adapter.refreshOn).toEqual(['createItem', 'deleteItem']);
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

describe('pf2e player view', () => {
  const player = (settings: Partial<Pf2eViewer> = {}) =>
    createPf2eAdapter((uuid) => names[uuid] ?? null, () => ({ isGM: false, showResults: true, tokenNames: true, ...settings }));

  it('hides the degree of success when the world hides check results', () => {
    const outcome = (a: ReturnType<typeof player>) => a.facets.find((f) => f.key === 'pf2e.outcome')!;
    expect(outcome(player()).values(attack)).toEqual(['criticalSuccess']);
    expect(outcome(player({ showResults: false })).values(attack)).toEqual([]);
  });

  it('shows the author in place of a token name players cannot see', () => {
    const { speaker } = player().redactor!;
    const hidden = { flags: {}, alias: 'Goblin Boss', author: { name: 'GM' }, token: { name: 'Goblin Boss', playersCanSeeName: false } };
    expect(speaker!(hidden)).toBe('GM');
    expect(speaker!({ ...hidden, token: { name: 'Goblin Boss', playersCanSeeName: true } })).toBeNull();
    expect(player({ tokenNames: false }).redactor!.speaker!(hidden)).toBeNull();
  });

  it('drops gm and none elements and keeps public ones', () => {
    expect(playerSeesElement({ visibility: 'gm' }, { flags: {} })).toBe(false);
    expect(playerSeesElement({ visibility: 'none' }, { flags: {} })).toBe(false);
    expect(playerSeesElement({ visibility: 'all' }, { flags: {} })).toBe(true);
  });

  it('shows an owner element for a player-owned actor only', () => {
    const pc = { flags: {}, actor: { hasPlayerOwner: true } };
    const npc = { flags: {}, actor: { hasPlayerOwner: false } };
    expect(playerSeesElement({ visibility: 'owner' }, pc)).toBe(true);
    expect(playerSeesElement({ visibility: 'owner' }, npc)).toBe(false);
    expect(playerSeesElement({ visibility: 'owner', whose: 'opposer' }, { ...pc, target: { actor: { hasPlayerOwner: false } } })).toBe(false);
    expect(playerSeesElement({ visibility: 'owner', action: 'roll' }, { flags: {}, actor: { isOwner: true } })).toBe(true);
  });
});
