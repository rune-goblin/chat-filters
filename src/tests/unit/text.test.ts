import { describe, expect, it } from 'vitest';
import { htmlToText, parseTerms, snippet } from '@/search/text';

describe('htmlToText', () => {
  it('strips tags, scripts and styles and collapses whitespace', () => {
    expect(htmlToText('<div><h4>Strike</h4>\n<style>.x{}</style><p>Longsword&nbsp;&amp; shield</p></div>')).toBe(
      'Strike Longsword & shield',
    );
  });

  it('decodes numeric entities', () => {
    expect(htmlToText('&#8212;&#x2014;')).toBe('——');
  });

  it('returns empty for missing html', () => {
    expect(htmlToText(undefined)).toBe('');
  });
});

describe('parseTerms', () => {
  it('lower-cases words and keeps quoted phrases whole', () => {
    expect(parseTerms('Fireball "Critical Failure" goblin')).toEqual(['fireball', 'critical failure', 'goblin']);
  });

  it('tolerates an unclosed quote', () => {
    expect(parseTerms('"reflex save')).toEqual(['reflex save']);
  });
});

describe('snippet', () => {
  it('marks every term occurrence', () => {
    expect(snippet('Reflex save vs Fireball', ['fireball', 'save'])).toEqual([
      { text: 'Reflex ', hit: false },
      { text: 'save', hit: true },
      { text: ' vs ', hit: false },
      { text: 'Fireball', hit: true },
    ]);
  });

  it('centres a long text on the first match', () => {
    const text = `${'a '.repeat(200)}needle${' b'.repeat(200)}`;
    const joined = snippet(text, ['needle'], 60).map((s) => s.text).join('');
    expect(joined.startsWith('…')).toBe(true);
    expect(joined.endsWith('…')).toBe(true);
    expect(joined).toContain('needle');
  });
});
