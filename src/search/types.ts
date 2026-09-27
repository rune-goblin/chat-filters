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
  /** Shown on the card even when its content is hidden, as on a blind roll. */
  header?: boolean;
}

/**
 * Hides from a player what their copy of a card hides. Facet `values` must do the same for
 * anything a system hides; the index never applies a redactor for a GM.
 */
export interface Redactor<M = ChatMessage> {
  /** The name the card header shows, or null to keep the message alias. */
  speaker?(message: M): string | null;
  /** Removes the elements of content or flavor HTML the card hides. */
  content?(root: ParentNode, message: M): void;
}

export interface SystemAdapter<M = ChatMessage> {
  systemId: string;
  facets: FacetDef<M>[];
  redactor?: Redactor<M>;
}

/** How the index turns a message into a record for the current user. */
export interface RecordView {
  facets: FacetDef[];
  speaker(message: ChatMessage): string;
  redact?(root: ParentNode, message: ChatMessage): void;
}

export type TimeRange = 'all' | 'hour' | 'today' | 'week';

export interface SearchQuery {
  text: string;
  time: TimeRange;
  /** facet key → selected values; a record matches a facet when it has any selected value. */
  facets: Record<string, string[]>;
}
