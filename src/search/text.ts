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
