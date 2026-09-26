const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? match;
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits a query into lower-cased terms; `"double quotes"` keep a phrase together. */
export function parseTerms(query: string): string[] {
  const terms: string[] = [];
  for (const match of query.toLowerCase().matchAll(/"([^"]*)"?|(\S+)/g)) {
    const term = (match[1] ?? match[2]).trim();
    if (term) terms.push(term);
  }
  return terms;
}

export interface Segment {
  text: string;
  hit: boolean;
}

/**
 * Cuts `text` to about `length` characters around the first term match and marks every
 * term occurrence inside that window.
 */
export function snippet(text: string, terms: string[], length = 180): Segment[] {
  const lower = text.toLowerCase();
  const first = terms.reduce((best, term) => {
    const at = lower.indexOf(term);
    return at >= 0 && (best < 0 || at < best) ? at : best;
  }, -1);

  let start = 0;
  if (first > length / 3) start = first - Math.floor(length / 3);
  const end = Math.min(text.length, start + length);
  const windowText = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  if (!terms.length) return [{ text: windowText, hit: false }];

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  return windowText
    .split(pattern)
    .filter(Boolean)
    .map((part) => ({ text: part, hit: terms.includes(part.toLowerCase()) }));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
