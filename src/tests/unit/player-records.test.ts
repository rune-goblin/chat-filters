// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeView } from '@/adapters';
import { buildRecord } from '@/search/records';

interface WorldOptions {
  system?: string;
  isGM?: boolean;
  showResults?: boolean;
  tokenNames?: boolean;
  docs?: Record<string, object>;
}

function stubWorld({ system = 'pf2e', isGM = false, showResults = true, tokenNames = true, docs = {} }: WorldOptions = {}) {
  vi.stubGlobal('game', {
    system: { id: system },
    user: { isGM },
    pf2e: { settings: { metagame: { results: showResults }, tokens: { nameVisibility: tokenNames } } },
  });
  vi.stubGlobal('foundry', { utils: { fromUuidSync: (uuid: string) => docs[uuid] ?? null } });
  vi.stubGlobal('CONST', { TOKEN_DISPLAY_MODES: { ALWAYS: 50, HOVER: 30 } });
}

let nextId = 0;
function message(overrides: Record<string, unknown> = {}): ChatMessage {
  return {
    id: `msg${++nextId}`,
    timestamp: 1,
    alias: 'Valeros',
    author: { name: 'Alice' },
    flavor: '',
    content: '',
    rolls: [],
    whisper: [],
    blind: false,
    isRoll: false,
    isContentVisible: true,
    flags: {},
    actor: { hasPlayerOwner: true, isOwner: true },
    token: null,
    ...overrides,
  } as unknown as ChatMessage;
}

function recordFor(msg: ChatMessage, world: WorldOptions = {}) {
  stubWorld(world);
  return buildRecord(msg, activeView(world.isGM ?? false));
}

const check = (overrides: Record<string, unknown> = {}) =>
  message({
    isRoll: true,
    flavor: '<h4>Perception check</h4><span data-visibility="gm">DC 31</span>',
    content: '<p>Result</p><span data-visibility="owner">+12 breakdown</span>',
    rolls: [{ formula: '1d20 + 12', total: 27 }],
    flags: {
      pf2e: {
        context: {
          type: 'perception-check',
          outcome: 'failure',
          target: { token: 'Scene.s.Token.boss' },
        },
      },
    },
    ...overrides,
  });

const docs = {
  'Scene.s.Token.boss': { name: 'Goblin Boss', documentName: 'Token', playersCanSeeName: false },
};

beforeEach(() => {
  nextId = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('player records under pf2e', () => {
  it('leaves gm-only text out of the player haystack and keeps it for the GM', () => {
    expect(recordFor(check()).haystack).not.toContain('dc 31');
    expect(recordFor(check(), { isGM: true }).haystack).toContain('dc 31');
  });

  it('keeps the rest of a visible check searchable', () => {
    const { haystack } = recordFor(check());
    expect(haystack).toContain('perception check');
    expect(haystack).toContain('27');
  });

  it('keeps owner text for a player-owned actor and drops it for an NPC', () => {
    expect(recordFor(check()).haystack).toContain('+12 breakdown');
    expect(recordFor(check({ actor: { hasPlayerOwner: false } })).haystack).not.toContain('+12 breakdown');
  });

  it('indexes only the header of a blind roll', () => {
    const record = recordFor(check({ blind: true, isContentVisible: false }));
    expect(record.haystack.trim()).toBe('valeros');
    expect(Object.keys(record.facets).sort()).toEqual(['author', 'speaker', 'visibility']);
    expect(record.facets.visibility).toEqual(['blind']);
  });

  it('indexes a blind roll in full for the GM', () => {
    const record = recordFor(check({ blind: true }), { isGM: true });
    expect(record.haystack).toContain('27');
    expect(record.facets['pf2e.outcome']).toEqual(['failure']);
  });

  it('drops the degree of success when the world hides check results', () => {
    expect(recordFor(check()).facets['pf2e.outcome']).toEqual(['failure']);
    expect(recordFor(check(), { showResults: false }).facets['pf2e.outcome']).toBeUndefined();
    expect(recordFor(check(), { isGM: true, showResults: false }).facets['pf2e.outcome']).toEqual(['failure']);
  });

  it('drops a target whose token name players cannot see', () => {
    expect(recordFor(check(), { docs }).facets['pf2e.target']).toBeUndefined();
    expect(recordFor(check(), { docs, tokenNames: false }).facets['pf2e.target']).toEqual(['Goblin Boss']);
    expect(recordFor(check(), { docs, isGM: true }).facets['pf2e.target']).toEqual(['Goblin Boss']);
  });

  it('shows the author in place of a hidden speaker name', () => {
    const npc = message({
      alias: 'Goblin Boss',
      author: { name: 'Gina (GM)' },
      content: 'You shall not pass',
      actor: { hasPlayerOwner: false },
      token: { name: 'Goblin Boss', playersCanSeeName: false },
    });
    const record = recordFor(npc);
    expect(record.speaker).toBe('Gina (GM)');
    expect(record.facets.speaker).toEqual(['Gina (GM)']);
    expect(record.haystack).not.toContain('goblin');
    expect(recordFor(npc, { isGM: true }).facets.speaker).toEqual(['Goblin Boss']);
  });

  it('judges a speaker without a placed token by its prototype token', () => {
    const npc = message({
      alias: 'Goblin Boss',
      actor: { hasPlayerOwner: false, prototypeToken: { name: 'Goblin Boss', displayName: 0 } },
    });
    expect(recordFor(npc).speaker).toBe('Alice');
    const shown = message({
      alias: 'Goblin Boss',
      actor: { hasPlayerOwner: false, prototypeToken: { name: 'Goblin Boss', displayName: 50 } },
    });
    expect(recordFor(shown).speaker).toBe('Goblin Boss');
  });
});

describe('player records under other systems', () => {
  it('still indexes only the header of a blind roll', () => {
    const record = recordFor(check({ blind: true, isContentVisible: false }), { system: 'dnd5e' });
    expect(record.haystack.trim()).toBe('valeros');
    expect(Object.keys(record.facets).sort()).toEqual(['author', 'speaker', 'visibility']);
  });

  it('leaves data-visibility markup alone, since only PF2e hides it', () => {
    expect(recordFor(check(), { system: 'dnd5e' }).haystack).toContain('dc 31');
  });
});
