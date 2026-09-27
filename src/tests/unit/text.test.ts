import { describe, expect, it } from 'vitest';
import { htmlToText, parseTerms } from '@/search/text';

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
