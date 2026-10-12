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
    speakerActor: { isOwner: true, getCondition: (slug: string) => (conditions.has(slug) ? {} : null) },
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

  it('stops listening on disconnect', () => {
    const index = new ChatIndex();
    index.connect();
    index.disconnect();
    expect(handlers.size).toBe(0);
  });
});
