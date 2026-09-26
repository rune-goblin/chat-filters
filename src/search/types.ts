export type Visibility = 'public' | 'whisper' | 'blind';

export interface MessageRecord {
  id: string;
  timestamp: number;
  speaker: string;
  /** Lower-cased text the query matches against: speaker, flavor, content, roll formulas and totals. */
  haystack: string;
  /** Readable text shown in the result row. */
  preview: string;
  facets: Record<string, string[]>;
}

/**
 * A filterable dimension of a chat message. Core facets work under any system; a system
 * adapter adds its own.
 */
export interface FacetDef<M = ChatMessage> {
  key: string;
  /** i18n key */
  label: string;
  values(message: M): string[];
  valueLabel?(value: string): string;
}

export interface SystemAdapter<M = ChatMessage> {
  systemId: string;
  facets: FacetDef<M>[];
}

export type TimeRange = 'all' | 'hour' | 'today' | 'week';

export interface SearchQuery {
  text: string;
  time: TimeRange;
  /** facet key → selected values; a record matches a facet when it has any selected value. */
  facets: Record<string, string[]>;
}
