import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatIndex } from '@/search/index.svelte';

const handlers = new Map<string, () => void>();
const conditions = new Set<string>();

function card(id: string, type: string) {
  return {
    id,
    timestamp: 1,
    alias: 'Kellid Graveknight',
    author: { name: 'Gina (GM)' },
    flavor: `Persistent Damage (2d6 ${type})`,
    content: '',
    rolls: [{ formula: '2d6', total: 5, options: { evaluatePersistent: true }, instances: [{ type, persistent: true }] }],
    whisper: [],
    blind: false,
    isRoll: true,
    visible: true,
    isContentVisible: true,
    flags: {},
    speaker: { token: 'graveknight' },
    speakerActor: { isOwner: true, getCondition: (slug: string) => (conditions.has(slug) ? {} : null) },
  };
}

function recoveryRoll(id: string, type: string) {
  return {
    ...card(id, type),
    rolls: [{ formula: '1d20', total: 9 }],
    flags: { pf2e: { context: { type: 'flat-check', options: ['check:statistic:pd-recovery', `item:damage:type:${type}`] } } },
  };
}

beforeEach(() => {
  handlers.clear();
  conditions.clear();
  conditions.add('persistent-damage-fire').add('persistent-damage-acid');
  vi.stubGlobal('foundry', { utils: { debounce: (fn: () => void) => fn, fromUuidSync: () => null } });
  vi.stubGlobal('Hooks', {
    on: (hook: string, fn: () => void) => handlers.set(hook, fn).size,
    off: (hook: string) => handlers.delete(hook),
  });
  vi.stubGlobal('game', {
    ready: true,
    system: { id: 'pf2e' },
    user: { isGM: true },
    messages: { contents: [card('fire', 'fire'), card('acid', 'acid')] },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChatIndex live facets', () => {
  const buttons = (index: ChatIndex, id: string) => index.records.find((r) => r.id === id)!.facets['pf2e.button'];

  it('rebuilds only the record whose card lost its button when a condition ends', () => {
    const index = new ChatIndex();
    index.connect();
    const [acid, fire] = index.records;
    expect(buttons(index, 'fire')).toEqual(['recovery-check']);

    conditions.delete('persistent-damage-fire');
    handlers.get('deleteItem')!();

    expect(buttons(index, 'fire')).toBeUndefined();
    expect(index.records.find((r) => r.id === 'fire')).not.toBe(fire);
    expect(index.records.find((r) => r.id === 'acid')).toBe(acid);
  });

  it('gives the button back when the condition returns', () => {
    conditions.delete('persistent-damage-fire');
    const index = new ChatIndex();
    index.connect();
    expect(buttons(index, 'fire')).toBeUndefined();

    conditions.add('persistent-damage-fire');
    handlers.get('createItem')!();

    expect(buttons(index, 'fire')).toEqual(['recovery-check']);
  });

  it('reads each card against the rest of the log, and again when a roll arrives', () => {
    const index = new ChatIndex();
    index.connect();
    const awaiting = (id: string) => index.records.find((r) => r.id === id)!.facets['pf2e.awaiting'];
    const acid = index.records.find((r) => r.id === 'acid');
    expect(awaiting('fire')).toEqual(['pd-recovery']);

    game.messages!.contents.push(recoveryRoll('roll', 'fire') as never);
    handlers.get('createChatMessage')!();

    expect(awaiting('fire')).toBeUndefined();
    expect(awaiting('acid')).toEqual(['pd-recovery']);
    expect(index.records.find((r) => r.id === 'acid')).toBe(acid);
  });

  it('stops listening on disconnect', () => {
    const index = new ChatIndex();
    index.connect();
    index.disconnect();
    expect(handlers.size).toBe(0);
  });
});
