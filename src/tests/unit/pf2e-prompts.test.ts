// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createPf2eAdapter, type FlaggedMessage, type Pf2eViewer } from '@/adapters/pf2e';
import { awaitedRolls, storedPrompts, targetRows, type PromptCard } from '@/adapters/pf2e-prompts';

const root = (html: string) => {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
};

const SPELL = 'Actor.caster.Item.spell';
const saveButton = '<button data-action="spell-save" data-save="reflex" data-dc="37">Save <span data-visibility="owner">DC 37</span> basic Reflex</button>';
const checkLink = (statistic: string, dc: number, item?: string) =>
  `<a class="inline-check with-repost" data-pf2-check="${statistic}" data-pf2-dc="${dc}"${item ? ` data-item-uuid="${item}"` : ''}>DC ${dc}</a>`;

describe('storedPrompts', () => {
  it('reads the save a spell card asks for', () => {
    expect(storedPrompts(root(saveButton), SPELL)).toEqual([{ statistic: 'reflex', dc: 37, item: SPELL }]);
  });

  it('reads an inline check link and prefers the item the link names', () => {
    expect(storedPrompts(root(checkLink('diplomacy', 39)), undefined)).toEqual([{ statistic: 'diplomacy', dc: 39, item: undefined }]);
    expect(storedPrompts(root(checkLink('reflex', 34, 'Actor.npc.Item.blast')), SPELL)[0].item).toBe('Actor.npc.Item.blast');
  });

  it('reads the raw link a roll note or a typed message stores', () => {
    const note = '<li class="roll-note">@Check[fortitude|against:class|name:Hammer Critical Specialization]</li>';
    expect(storedPrompts(root(note), SPELL)).toEqual([{ statistic: 'fortitude', dc: undefined, item: SPELL }]);
    expect(storedPrompts(root('<p>@Check[type:will|dc:25]</p>'))).toEqual([{ statistic: 'will', dc: 25, item: undefined }]);
  });

  it('ignores a link quoted inside a tooltip', () => {
    const condition = '<li data-tooltip="&lt;a class=&quot;inline-check&quot; data-pf2-check=&quot;flat&quot;&gt;DC 5&lt;/a&gt;">Concealed</li>';
    expect(storedPrompts(root(condition))).toEqual([]);
  });
});

const TOKEN = (id: string) => `Scene.s.Token.${id}`;
const toolbelt = (targetHelper: object) => ({ 'pf2e-toolbelt': { targetHelper } });
const variant = (statistic: string, dc: number, saved: string[] = []) => ({
  null: { statistic, dc, basic: true, saves: Object.fromEntries(saved.map((id) => [id, { value: 30 }])) },
});

describe('targetRows', () => {
  const flags = toolbelt({ type: 'damage', item: SPELL, targets: [TOKEN('a'), TOKEN('gone')], saveVariants: variant('reflex', 37, ['a']) });

  it('lists the targets that still exist and the saves on record', () => {
    expect(targetRows(flags, (uuid) => uuid !== TOKEN('gone'))).toEqual({
      item: SPELL,
      targets: ['a'],
      saves: [{ statistic: 'reflex', dc: 37, saved: ['a'] }],
      damage: true,
    });
  });

  it('reads no rows from a card toolbelt leaves bare', () => {
    expect(targetRows(toolbelt({ type: 'action', targets: [TOKEN('a')] }), () => true)).toBeNull();
    expect(targetRows(toolbelt({ targets: [TOKEN('a')] }), () => true)).toBeNull();
    expect(targetRows({}, () => true)).toBeNull();
  });

  it('skips a spell variant that sets no save', () => {
    const rows = targetRows(toolbelt({ type: 'spell', targets: [], saveVariants: { null: null, heal: { dc: 35 } } }), () => true);
    expect(rows?.saves).toEqual([]);
  });
});

const card = (partial: Partial<PromptCard>): PromptCard => ({ prompts: [], rollers: [], answers: [], ...partial });

describe('awaitedRolls', () => {
  const diplomacy = { statistic: 'diplomacy', dc: 39 };

  it('awaits a prompt until a roll of its statistic against its DC follows', () => {
    const prompt = card({ prompts: [diplomacy] });
    expect(awaitedRolls([prompt])).toEqual([['diplomacy']]);
    expect(awaitedRolls([prompt, card({ answers: [{ statistic: 'diplomacy', dc: 30 }] })])[0]).toEqual(['diplomacy']);
    expect(awaitedRolls([prompt, card({ answers: [{ statistic: 'religion', dc: 39 }] })])[0]).toEqual(['diplomacy']);
    expect(awaitedRolls([prompt, card({ answers: [{ statistic: 'diplomacy', dc: 39 }] })])[0]).toEqual([]);
  });

  it('leaves a roll made before the card out, so a second cast asks again', () => {
    const save = card({ answers: [{ statistic: 'reflex', dc: 37, item: SPELL }] });
    const cast = card({ prompts: [{ statistic: 'reflex', dc: 37, item: SPELL }] });
    expect(awaitedRolls([cast, save, cast])).toEqual([[], [], ['reflex']]);
  });

  it('tells the rolls of two items apart when both sides name their item', () => {
    const cast = card({ prompts: [{ statistic: 'reflex', dc: 37, item: SPELL }] });
    expect(awaitedRolls([cast, card({ answers: [{ statistic: 'reflex', dc: 37, item: 'Actor.caster.Item.other' }] })])[0]).toEqual(['reflex']);
    expect(awaitedRolls([cast, card({ answers: [{ statistic: 'reflex', dc: 12, item: SPELL }] })])[0]).toEqual([]);
    expect(awaitedRolls([cast, card({ answers: [{ statistic: 'reflex', dc: 37 }] })])[0]).toEqual([]);
  });

  it('lets a prompt with neither item nor DC take any roll of its statistic', () => {
    const bare = card({ prompts: [{ statistic: 'perception' }] });
    expect(awaitedRolls([bare, card({ answers: [{ statistic: 'perception', dc: 20 }] })])[0]).toEqual([]);
    const itemOnly = card({ prompts: [{ statistic: 'perception', item: SPELL }] });
    expect(awaitedRolls([itemOnly, card({ answers: [{ statistic: 'perception', dc: 20 }] })])[0]).toEqual(['perception']);
  });

  it('awaits every roller the card lists, counting the saves the card itself records', () => {
    const prompt = { statistic: 'reflex', dc: 37, item: SPELL };
    const rows = (saved: string[]) => card({ prompts: [prompt], rollers: ['a', 'b'], answers: saved.map((roller) => ({ ...prompt, roller })) });
    expect(awaitedRolls([rows([])])).toEqual([['reflex']]);
    expect(awaitedRolls([rows(['a'])])).toEqual([['reflex']]);
    expect(awaitedRolls([rows(['a', 'b'])])).toEqual([[]]);
    expect(awaitedRolls([rows(['a']), card({ answers: [{ ...prompt, roller: 'c' }] })])[0]).toEqual(['reflex']);
    expect(awaitedRolls([rows(['a']), card({ answers: [{ ...prompt, roller: 'b' }] })])[0]).toEqual([]);
  });

  it('reports a statistic once however many of its prompts wait', () => {
    const quandary = card({ prompts: [{ statistic: 'thievery' }, { statistic: 'thievery' }, { statistic: 'occultism' }] });
    expect(awaitedRolls([quandary])).toEqual([['thievery', 'occultism']]);
  });
});

const names: Record<string, string> = { [TOKEN('a')]: 'Kromori', [TOKEN('b')]: 'Illocor' };
const adapterFor = (viewer: Partial<Pf2eViewer> = {}) =>
  createPf2eAdapter(
    (uuid) => names[uuid] ?? null,
    () => ({ isGM: true, showResults: true, tokenNames: false, targetRows: true, ...viewer }),
  );
const facetOf = (adapter: ReturnType<typeof adapterFor>, key: string) => adapter.facets.find((f) => f.key === key)!;

let nextId = 0;
const message = (partial: Partial<FlaggedMessage>): FlaggedMessage => ({ id: `m${++nextId}`, flags: {}, ...partial });

const spellCard = () => message({ content: saveButton, flags: { pf2e: { origin: { uuid: SPELL, type: 'spell' }, context: { type: 'spell-cast' } } } });
const damageCard = (saved: string[] = [], targets = [TOKEN('a'), TOKEN('b')]) =>
  message({
    content: '72',
    flags: {
      pf2e: { origin: { uuid: SPELL, type: 'spell' }, context: { type: 'damage-roll' } },
      ...toolbelt({ type: 'damage', item: SPELL, targets, saveVariants: variant('reflex', 37, saved) }),
    },
  });
const save = (token: string, statistic = 'reflex', dc = 37, item: string | undefined = SPELL) =>
  message({
    speaker: { token },
    flags: {
      pf2e: {
        origin: item ? { uuid: item } : undefined,
        context: { type: 'saving-throw', dc: { value: dc }, options: [`check:statistic:${statistic}`, `check:statistic:base:${statistic}`] },
      },
    },
  });

describe('pf2e prompt facet', () => {
  it('lists the statistics a card asks for', () => {
    const prompt = facetOf(adapterFor(), 'pf2e.prompt');
    expect(prompt.values(spellCard())).toEqual(['reflex']);
    expect(prompt.values(message({ content: `${checkLink('thievery', 35)}${checkLink('thievery', 35)}${checkLink('occultism', 35)}` }))).toEqual(['thievery', 'occultism']);
    expect(prompt.values(save('a'))).toEqual([]);
  });

  it("counts toolbelt's save rows on a damage card while a target remains", () => {
    expect(facetOf(adapterFor(), 'pf2e.prompt').values(damageCard())).toEqual(['reflex']);
    expect(facetOf(adapterFor(), 'pf2e.prompt').values(damageCard([], [TOKEN('gone')]))).toEqual([]);
    expect(facetOf(adapterFor({ targetRows: false }), 'pf2e.prompt').values(damageCard())).toEqual([]);
  });

  it('reads a card again once PF2e has enriched its flavor', () => {
    const prompt = facetOf(adapterFor(), 'pf2e.prompt');
    const strike = message({ flavor: '<li class="roll-note">Knocked prone on a failed @Check[fortitude|against:class]</li>' });
    expect(prompt.values(strike)).toEqual(['fortitude']);
    expect(prompt.values(strike)).toEqual(['fortitude']);
    strike.flavor = `<li class="roll-note">Knocked prone on a failed ${checkLink('reflex', 30)}</li>`;
    expect(prompt.values(strike)).toEqual(['reflex']);
  });

  it('takes no prompt from the saves toolbelt notes on a spell card without a save button', () => {
    const heal = message({
      content: '<button data-action="spell-variant">Heal (vs. Living)</button>',
      flags: { pf2e: { origin: { uuid: SPELL, type: 'spell' } }, ...toolbelt({ type: 'spell', targets: [TOKEN('a')], saveVariants: variant('fortitude', 35) }) },
    });
    const adapter = adapterFor();
    adapter.prepare!([heal]);
    expect(facetOf(adapter, 'pf2e.prompt').values(heal)).toEqual([]);
    expect(facetOf(adapter, 'pf2e.awaiting').values(heal)).toEqual([]);
  });

  it('leaves out a link the player cannot see', () => {
    const secret = message({ content: `<span data-visibility="gm">${checkLink('will', 30)}</span>${checkLink('reflex', 30)}` });
    expect(facetOf(adapterFor(), 'pf2e.prompt').values(secret)).toEqual(['will', 'reflex']);
    expect(facetOf(adapterFor({ isGM: false, targetRows: false }), 'pf2e.prompt').values(secret)).toEqual(['reflex']);
  });

  it('follows the tokens in the world', () => {
    expect(facetOf(adapterFor(), 'pf2e.prompt').live).toBe(true);
    expect(adapterFor().refreshOn).toContain('deleteToken');
  });
});

describe('pf2e awaiting facet', () => {
  const awaitingIn = (messages: FlaggedMessage[], viewer: Partial<Pf2eViewer> = {}) => {
    const adapter = adapterFor(viewer);
    adapter.prepare!(messages);
    return messages.map((m) => facetOf(adapter, 'pf2e.awaiting').values(m));
  };

  it('holds a spell card until a save against that spell is rolled', () => {
    expect(awaitingIn([spellCard()])).toEqual([['reflex']]);
    expect(awaitingIn([spellCard(), save('a', 'will')])[0]).toEqual(['reflex']);
    expect(awaitingIn([spellCard(), save('a', 'reflex', 37, 'Actor.caster.Item.other')])[0]).toEqual(['reflex']);
    expect(awaitingIn([spellCard(), save('a')])[0]).toEqual([]);
  });

  it('matches a prompt posted from a journal to a roll by its DC', () => {
    const prompt = () => message({ content: checkLink('diplomacy', 39) });
    expect(awaitingIn([prompt(), save('a', 'diplomacy', 30, undefined)])[0]).toEqual(['diplomacy']);
    expect(awaitingIn([prompt(), save('a', 'diplomacy', 39, undefined)])[0]).toEqual([]);
  });

  it("holds a damage card until every target has a save in toolbelt's rows or in chat", () => {
    expect(awaitingIn([damageCard(['a'])])).toEqual([['reflex']]);
    expect(awaitingIn([damageCard(['a', 'b'])])).toEqual([[]]);
    expect(awaitingIn([damageCard(['a']), save('b')])[0]).toEqual([]);
    expect(awaitingIn([damageCard(['a']), save('c')])[0]).toEqual(['reflex']);
  });

  it('clears the spell card once the damage card that follows records a save', () => {
    expect(awaitingIn([spellCard(), damageCard()])).toEqual([['reflex'], ['reflex']]);
    expect(awaitingIn([spellCard(), damageCard(['a'])])).toEqual([[], ['reflex']]);
  });

  it('stops waiting on a target whose token is gone', () => {
    expect(awaitingIn([damageCard(['a'], [TOKEN('a'), TOKEN('gone')])])).toEqual([[]]);
  });

  const burning = (type: string, token = 'a') =>
    message({
      speaker: { token },
      rolls: [{ options: { evaluatePersistent: true }, instances: [{ type, persistent: true }] }],
      speakerActor: { isOwner: true, getCondition: (slug: string) => (slug === 'persistent-damage-fire' ? {} : null) },
    });
  const recovery = (type: string, token = 'a') =>
    message({
      speaker: { token },
      flags: { pf2e: { context: { type: 'flat-check', dc: { value: 15 }, options: ['check:statistic:pd-recovery', `item:damage:type:${type}`] } } },
    });

  it('holds a persistent damage card until that creature rolls recovery for that damage', () => {
    expect(awaitingIn([burning('fire')])).toEqual([['pd-recovery']]);
    expect(awaitingIn([burning('fire'), recovery('acid')])[0]).toEqual(['pd-recovery']);
    expect(awaitingIn([burning('fire'), recovery('fire', 'b')])[0]).toEqual(['pd-recovery']);
    expect(awaitingIn([recovery('fire'), burning('fire')])[1]).toEqual(['pd-recovery']);
    expect(awaitingIn([burning('fire'), recovery('fire')])[0]).toEqual([]);
  });

  it('awaits no recovery once the card has lost its button', () => {
    expect(awaitingIn([burning('acid')])).toEqual([[]]);
  });

  it('gives a player no awaiting filter', () => {
    expect(awaitingIn([spellCard(), burning('fire')], { isGM: false, targetRows: false })).toEqual([[], []]);
  });

  it('forgets the last build', () => {
    const adapter = adapterFor();
    const cast = spellCard();
    adapter.prepare!([cast]);
    adapter.prepare!([cast, save('a')]);
    expect(facetOf(adapter, 'pf2e.awaiting').values(cast)).toEqual([]);
  });
});
