import { describe, expect, it } from 'vitest';
import { buildRecord, isStale } from '@/search/records';
import type { FacetDef, RecordView } from '@/search/types';

const message = (overrides: Record<string, unknown> = {}) =>
  ({ id: 'm1', timestamp: 1, alias: 'Valeros', flavor: 'Persistent Damage', content: '', rolls: [], isContentVisible: true, ...overrides }) as unknown as ChatMessage;

function viewOf(...facets: FacetDef[]): RecordView {
  return { facets, speaker: (m) => m.alias };
}

describe('printed facets', () => {
  const button: FacetDef = { key: 'button', label: 'Button', values: () => ['recover'], valueLabel: () => 'Make Recovery Check', printed: true };
  const outcome: FacetDef = { key: 'outcome', label: 'Outcome', values: () => ['fail'], valueLabel: () => 'Failure' };

  it('adds their value labels to the text a search matches', () => {
    const { haystack } = buildRecord(message(), viewOf(button, outcome));
    expect(haystack).toContain('make recovery check');
    expect(haystack).not.toContain('failure');
  });

  it('adds nothing for a card whose content is hidden', () => {
    const record = buildRecord(message({ isContentVisible: false }), viewOf(button));
    expect(record.haystack).not.toContain('recovery');
    expect(record.facets.button).toBeUndefined();
  });
});

describe('isStale', () => {
  let buttons = ['recover'];
  const live: FacetDef = { key: 'button', label: 'Button', values: () => buttons, live: true };
  const fixed: FacetDef = { key: 'kind', label: 'Type', values: () => buttons };

  it('holds once a live facet reads differently', () => {
    buttons = ['recover'];
    const record = buildRecord(message(), viewOf(live));
    expect(isStale(record, message(), viewOf(live))).toBe(false);
    buttons = [];
    expect(isStale(record, message(), viewOf(live))).toBe(true);
  });

  it('ignores facets that read only the message', () => {
    buttons = ['recover'];
    const record = buildRecord(message(), viewOf(fixed));
    buttons = [];
    expect(isStale(record, message(), viewOf(fixed))).toBe(false);
  });

  it('leaves a hidden card alone, which never carried the facet', () => {
    buttons = ['recover'];
    const hidden = message({ isContentVisible: false });
    expect(isStale(buildRecord(hidden, viewOf(live)), hidden, viewOf(live))).toBe(false);
  });
});
