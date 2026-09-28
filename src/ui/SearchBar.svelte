<script lang="ts">
  import { MODULE_ID } from '@/constants';
  import { facetOptions } from '@/search/filter';
  import { search } from '@/search/state.svelte';
  import { currentToken, suggest, suggestionRows, type Row } from '@/search/suggest';
  import type { FacetDef } from '@/search/types';
  import { FiltersApp } from './FiltersApp';

  const t = (key: string) => game.i18n?.localize(`${MODULE_ID}.${key}`) ?? key;
  const f = (key: string, data: Record<string, string>) => game.i18n?.format(`${MODULE_ID}.${key}`, data) ?? key;
  const valueLabel = (facet: FacetDef, value: string) => facet.valueLabel?.(value) ?? value;

  let focused = $state(false);
  let dismissedFor = $state<string | null>(null);

  const facetByKey = $derived(new Map(search.index.facets.map((f) => [f.key, f])));
  const token = $derived(currentToken(search.text));
  const rows = $derived.by((): Row[] => {
    if (!focused || !token || dismissedFor === search.text) return [];
    const entries = search.index.facets.map((facet) => ({
      key: facet.key,
      label: game.i18n?.localize(facet.label) ?? facet.label,
      options: facetOptions(search.index.records, facet.key, (v) => valueLabel(facet, v)),
    }));
    return suggestionRows(search.text, search.results.length, suggest(token.text, entries, search.facets));
  });
  const chips = $derived(
    Object.entries(search.facets).flatMap(([key, values]) => {
      const facet = facetByKey.get(key);
      return values.map((value) => ({ key, value, label: facet ? valueLabel(facet, value) : value }));
    }),
  );

  // Writable derived: arrow keys move it, and a new suggestion list resets it.
  let highlighted = $derived.by(() => {
    void rows;
    return 0;
  });

  function pick(row: Row) {
    if (row.kind === 'filter') {
      search.select(row.key, row.value);
      if (token) search.text = search.text.slice(0, token.start);
      return;
    }
    dismissedFor = search.text;
  }

  const group = (row: Row) => (row.kind === 'filter' ? 'filters' : 'text');
  const rowKey = (row: Row) => (row.kind === 'text' ? 'text' : `${row.key}:${row.value}`);

  const rowLabel = (row: Row) => (row.kind === 'text' ? f('suggest.textValue', { text: row.text }) : row.valueLabel);

  function onKeydown(event: KeyboardEvent) {
    const open = rows.length > 0;
    if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      highlighted = (highlighted + step + rows.length) % rows.length;
    } else if (open && (event.key === 'Enter' || event.key === 'Tab')) {
      event.preventDefault();
      pick(rows[highlighted]);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      if (open) dismissedFor = search.text;
      else if (search.text) search.text = '';
      else (event.currentTarget as HTMLInputElement).blur();
    } else if (event.key === 'Backspace' && !search.text && chips.length) {
      const last = chips[chips.length - 1];
      search.deselect(last.key, last.value);
    }
  }
</script>

<div class="bar">
  <div class="row">
    <div class="field">
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      <input
        type="search"
        class="{MODULE_ID}-input"
        bind:value={search.text}
        placeholder={t('placeholder')}
        aria-label={t('placeholder')}
        role="combobox"
        aria-controls="{MODULE_ID}-suggestions"
        aria-autocomplete="list"
        aria-expanded={rows.length > 0}
        autocomplete="off"
        onkeydown={onKeydown}
        oninput={() => (dismissedFor = null)}
        onfocus={() => (focused = true)}
        onblur={() => (focused = false)}
      />
      {#if rows.length}
        <ul id="{MODULE_ID}-suggestions" class="suggestions" role="listbox">
          {#each rows as row, i (rowKey(row))}
            {#if i === 0 || group(rows[i - 1]) !== group(row)}
              <li role="presentation" class="group" data-group={group(row)}>{t(`suggest.${group(row)}`)}</li>
            {/if}
            <li
              role="option"
              aria-selected={i === highlighted}
              class:highlighted={i === highlighted}
              data-row={row.kind}
              data-value={row.kind === 'text' ? undefined : row.value}
              onpointerdown={(e) => {
                e.preventDefault();
                pick(row);
              }}
              onpointerenter={() => (highlighted = i)}
            >
              {#if row.kind === 'filter'}<span class="facet">{row.facetLabel}</span>{/if}
              <span class="value">{rowLabel(row)}</span>
              <span class="n">{row.count}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    {#if search.active}
      <span class="count" data-tooltip aria-label={t('matches')}>{search.results.length}</span>
      <button
        type="button"
        class="ui-control icon fa-solid fa-xmark"
        data-tooltip
        aria-label={t('clear')}
        onclick={() => search.reset()}
      ></button>
    {/if}
    <button
      type="button"
      class="ui-control icon fa-solid fa-filter filters"
      class:on={search.filterCount > 0}
      data-tooltip
      aria-label={t('filters')}
      onclick={() => FiltersApp.toggle()}
    >
      {#if search.filterCount}<span class="badge">{search.filterCount}</span>{/if}
    </button>
  </div>

  {#if chips.length}
    <div class="chips">
      {#each chips as chip (`${chip.key}:${chip.value}`)}
        <button type="button" class="chip" onclick={() => search.deselect(chip.key, chip.value)} aria-label={t('remove')}>
          {chip.label}
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .bar {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .field {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }
  .field > i {
    position: absolute;
    left: 0.5rem;
    font-size: var(--font-size-12, 0.75rem);
    color: var(--color-text-secondary);
    pointer-events: none;
  }
  .field input {
    width: 100%;
    padding-left: 1.75rem;
  }
  .suggestions {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    z-index: 100;
    margin: 0;
    padding: 2px;
    list-style: none;
    background: var(--color-cool-5, #1b1d24);
    border: 1px solid var(--color-cool-4, #444);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.5);
  }
  .suggestions li {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 4px 6px;
    border-radius: 3px;
    cursor: pointer;
    font-size: var(--font-size-13, 0.8125rem);
  }
  .suggestions li.group {
    padding: 4px 6px 2px;
    cursor: default;
    font-size: var(--font-size-10, 0.625rem);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-secondary);
  }
  .suggestions li.group:not(:first-child) {
    margin-top: 2px;
    border-top: 1px solid var(--color-cool-4, #444);
  }
  .suggestions li.highlighted {
    background: var(--color-cool-4, #333);
  }
  .suggestions .facet {
    flex: 0 0 auto;
    font-size: var(--font-size-11, 0.6875rem);
    color: var(--color-text-secondary);
  }
  .suggestions .value {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .suggestions .n {
    font-size: var(--font-size-11, 0.6875rem);
    color: var(--color-text-secondary);
  }
  .count {
    font-size: var(--font-size-12, 0.75rem);
    color: var(--color-text-secondary);
    min-width: 1.5rem;
    text-align: center;
  }
  .filters {
    position: relative;
  }
  .filters.on {
    color: var(--color-warm-2, #ee9b3a);
  }
  .badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 7px;
    background: var(--color-warm-2, #ee9b3a);
    color: #000;
    font: 700 10px/14px var(--font-body, sans-serif);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chip {
    flex: 0 0 auto;
    width: auto;
    height: auto;
    padding: 1px 6px;
    font-size: var(--font-size-11, 0.6875rem);
    line-height: 1.5;
  }
</style>
