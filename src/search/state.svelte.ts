import { filterRecords } from './filter';
import { ChatIndex } from './index.svelte';
import type { SearchQuery, TimeRange } from './types';

class SearchState {
  readonly index = new ChatIndex();
  text = $state('');
  time = $state<TimeRange>('all');
  facets = $state<Record<string, string[]>>({});

  readonly query: SearchQuery = $derived({ text: this.text, time: this.time, facets: this.facets });
  readonly queryKey = $derived(JSON.stringify(this.query));
  readonly filterCount = $derived(
    (this.time === 'all' ? 0 : 1) + Object.values(this.facets).reduce((n, values) => n + values.length, 0),
  );
  readonly active = $derived(this.text.trim() !== '' || this.filterCount > 0);
  /** Newest first; empty while no search or filter is active. */
  readonly results = $derived(this.active ? filterRecords(this.index.records, this.query) : []);

  select(key: string, value: string): void {
    const current = this.facets[key] ?? [];
    if (value && !current.includes(value)) this.facets[key] = [...current, value];
  }

  deselect(key: string, value: string): void {
    this.facets[key] = (this.facets[key] ?? []).filter((v) => v !== value);
  }

  clearFilters(): void {
    this.time = 'all';
    this.facets = {};
  }

  reset(): void {
    this.text = '';
    this.clearFilters();
  }
}

export const search = new SearchState();
