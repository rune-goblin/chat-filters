<script lang="ts">
  import { MODULE_ID } from '@/constants';
  import { facetOptions, filterRecords } from '@/search/filter';
  import type { ChatIndex } from '@/search/index.svelte';
  import { parseTerms, snippet } from '@/search/text';
  import type { FacetDef, MessageRecord, TimeRange } from '@/search/types';
  import { revealMessage } from './reveal';

  const PAGE = 100;
  const TIME_RANGES: TimeRange[] = ['all', 'hour', 'today', 'week'];
  const BADGE_FACETS = ['pf2e.rollType', 'pf2e.outcome', 'visibility'];

  let { index }: { index: ChatIndex } = $props();

  let text = $state('');
  let time = $state<TimeRange>('all');
  let selected = $state<Record<string, string[]>>({});

  const t = (key: string) => game.i18n?.localize(`${MODULE_ID}.${key}`) ?? key;
  const valueLabel = (facet: FacetDef, value: string) => facet.valueLabel?.(value) ?? value;
  const facetByKey = $derived(new Map(index.facets.map((f) => [f.key, f])));

  const terms = $derived(parseTerms(text));
  const results = $derived(filterRecords(index.records, { text, time, facets: selected }));
  // Writable derived: "Show more" raises it, and any change to the results resets it.
  let limit = $derived.by(() => {
    void results;
    return PAGE;
  });
  const shown = $derived(results.slice(0, limit));
  const facets = $derived(
    index.facets
      .map((facet) => ({ facet, options: facetOptions(index.records, facet.key) }))
      .filter(({ facet, options }) => options.length > 1 || selected[facet.key]?.length),
  );
  const hasFilters = $derived(text !== '' || time !== 'all' || Object.values(selected).some((v) => v.length));

  function select(key: string, value: string) {
    if (!value) return;
    const current = selected[key] ?? [];
    if (!current.includes(value)) selected[key] = [...current, value];
  }

  function deselect(key: string, value: string) {
    selected[key] = (selected[key] ?? []).filter((v) => v !== value);
  }

  function reset() {
    text = '';
    time = 'all';
    selected = {};
  }

  async function reveal(record: MessageRecord) {
    if (!(await revealMessage(record.id))) ui.notifications?.warn(t('notFound'));
  }

  function badges(record: MessageRecord) {
    return BADGE_FACETS.flatMap((key) => {
      const facet = facetByKey.get(key);
      const values = record.facets[key] ?? [];
      if (!facet || (key === 'visibility' && values[0] === 'public')) return [];
      return values.map((v) => ({ key, value: v, label: valueLabel(facet, v) }));
    });
  }

  function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleString(game.i18n?.lang, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
</script>

<div class="search">
  <div class="query">
    <input
      type="search"
      bind:value={text}
      placeholder={t('placeholder')}
      aria-label={t('placeholder')}
      {@attach (node) => node.focus()}
    />
    <select bind:value={time} aria-label={t('time.label')}>
      {#each TIME_RANGES as range (range)}
        <option value={range}>{t(`time.${range}`)}</option>
      {/each}
    </select>
  </div>

  {#if facets.length}
    <div class="facets">
      {#each facets as { facet, options } (facet.key)}
        <label class="facet">
          <span>{game.i18n?.localize(facet.label)}</span>
          <select
            value=""
            onchange={(e) => {
              select(facet.key, e.currentTarget.value);
              e.currentTarget.value = '';
            }}
          >
            <option value="">{t('any')}</option>
            {#each options as option (option.value)}
              <option value={option.value} disabled={selected[facet.key]?.includes(option.value)}>
                {valueLabel(facet, option.value)} ({option.count})
              </option>
            {/each}
          </select>
        </label>
      {/each}
    </div>
  {/if}

  {#if hasFilters}
    <div class="chips">
      {#each Object.entries(selected) as [key, values] (key)}
        {#each values as value (value)}
          {@const facet = facetByKey.get(key)}
          <button type="button" class="chip" onclick={() => deselect(key, value)} aria-label={t('remove')}>
            {facet ? `${game.i18n?.localize(facet.label)}: ${valueLabel(facet, value)}` : value}
            <i class="fa-solid fa-xmark"></i>
          </button>
        {/each}
      {/each}
      <button type="button" class="clear" onclick={reset}>{t('clear')}</button>
    </div>
  {/if}

  <p class="count">
    {game.i18n?.format(`${MODULE_ID}.count`, { shown: String(results.length), total: String(index.records.length) })}
  </p>

  <ol class="results">
    {#each shown as record (record.id)}
      <li>
        <button type="button" class="result" onclick={() => reveal(record)}>
          <div class="meta">
            <strong>{record.speaker}</strong>
            <time>{formatTime(record.timestamp)}</time>
          </div>
          {#if badges(record).length}
            <div class="badges">
              {#each badges(record) as badge (`${badge.key}:${badge.value}`)}
                <span class="badge" data-facet={badge.key} data-value={badge.value}>{badge.label}</span>
              {/each}
            </div>
          {/if}
          <p class="snippet">
            {#each snippet(record.preview, terms) as segment, i (i)}
              {#if segment.hit}<mark>{segment.text}</mark>{:else}{segment.text}{/if}
            {/each}
          </p>
        </button>
      </li>
    {:else}
      <li class="empty">{t('empty')}</li>
    {/each}
  </ol>

  {#if results.length > limit}
    <button type="button" class="more" onclick={() => (limit += PAGE)}>{t('more')}</button>
  {/if}
</div>

<style>
  .search {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    height: 100%;
    min-height: 0;
  }
  .query {
    display: flex;
    gap: 0.5rem;
  }
  .query input {
    flex: 1;
  }
  .query select {
    flex: 0 0 auto;
    width: auto;
  }
  .facets {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
    gap: 0.25rem 0.5rem;
  }
  .facet {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    font-size: var(--font-size-12, 0.75rem);
    color: var(--color-text-secondary);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .chip,
  .clear {
    flex: 0 0 auto;
    width: auto;
    height: auto;
    padding: 0.125rem 0.5rem;
    font-size: var(--font-size-12, 0.75rem);
    line-height: 1.5;
  }
  .count {
    margin: 0;
    font-size: var(--font-size-12, 0.75rem);
    color: var(--color-text-secondary);
  }
  .results {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .result {
    display: block;
    width: 100%;
    height: auto;
    padding: 0.375rem 0.5rem;
    text-align: start;
    font-weight: normal;
    line-height: 1.35;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .meta time {
    flex: 0 0 auto;
    font-size: var(--font-size-11, 0.6875rem);
    color: var(--color-text-secondary);
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.125rem;
  }
  .badge {
    padding: 0 0.375rem;
    border-radius: 999px;
    font-size: var(--font-size-11, 0.6875rem);
    background: var(--chat-search-badge, rgb(127 127 127 / 0.2));
  }
  .badge[data-value='criticalSuccess'] {
    --chat-search-badge: rgb(34 139 34 / 0.35);
  }
  .badge[data-value='success'] {
    --chat-search-badge: rgb(30 100 200 / 0.3);
  }
  .badge[data-value='failure'] {
    --chat-search-badge: rgb(220 120 0 / 0.3);
  }
  .badge[data-value='criticalFailure'] {
    --chat-search-badge: rgb(200 30 30 / 0.35);
  }
  .snippet {
    margin: 0.25rem 0 0;
    font-size: var(--font-size-12, 0.75rem);
    overflow-wrap: anywhere;
  }
  mark {
    background: var(--color-warm-2, #ee9b3a);
    color: inherit;
    border-radius: 2px;
  }
  .empty {
    padding: 1rem;
    text-align: center;
    color: var(--color-text-secondary);
  }
  .more {
    flex: 0 0 auto;
  }
</style>
