<script lang="ts">
  import { MODULE_ID } from '@/constants';
  import { facetOptions } from '@/search/filter';
  import { search } from '@/search/state.svelte';
  import type { FacetDef, TimeRange } from '@/search/types';

  const TIME_RANGES: TimeRange[] = ['all', 'hour', 'today', 'week'];

  const t = (key: string) => game.i18n?.localize(`${MODULE_ID}.${key}`) ?? key;
  const valueLabel = (facet: FacetDef, value: string) => facet.valueLabel?.(value) ?? value;
  const facetByKey = $derived(new Map(search.index.facets.map((f) => [f.key, f])));

  const facets = $derived(
    search.index.facets
      .map((facet) => ({ facet, options: facetOptions(search.index.records, facet.key) }))
      .filter(({ facet, options }) => options.length > 1 || search.facets[facet.key]?.length),
  );
</script>

<div class="filters">
  <label class="facet">
    <span>{t('time.label')}</span>
    <select bind:value={search.time}>
      {#each TIME_RANGES as range (range)}
        <option value={range}>{t(`time.${range}`)}</option>
      {/each}
    </select>
  </label>

  {#each facets as { facet, options } (facet.key)}
    <label class="facet">
      <span>{game.i18n?.localize(facet.label)}</span>
      <select
        value=""
        onchange={(e) => {
          search.select(facet.key, e.currentTarget.value);
          e.currentTarget.value = '';
        }}
      >
        <option value="">{t('any')}</option>
        {#each options as option (option.value)}
          <option value={option.value} disabled={search.facets[facet.key]?.includes(option.value)}>
            {valueLabel(facet, option.value)} ({option.count})
          </option>
        {/each}
      </select>
    </label>
  {/each}
</div>

{#if search.filterCount}
  <div class="chips">
    {#each Object.entries(search.facets) as [key, values] (key)}
      {#each values as value (value)}
        {@const facet = facetByKey.get(key)}
        <button type="button" class="chip" onclick={() => search.deselect(key, value)} aria-label={t('remove')}>
          {facet ? `${game.i18n?.localize(facet.label)}: ${valueLabel(facet, value)}` : value}
          <i class="fa-solid fa-xmark"></i>
        </button>
      {/each}
    {/each}
    <button type="button" class="chip clear" onclick={() => search.clearFilters()}>{t('clearFilters')}</button>
  </div>
{/if}

<p class="count">
  {game.i18n?.format(`${MODULE_ID}.count`, {
    shown: String(search.active ? search.results.length : search.index.records.length),
    total: String(search.index.records.length),
  })}
</p>

<style>
  .filters {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
    gap: 0.375rem 0.5rem;
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
    margin-top: 0.5rem;
  }
  .chip {
    flex: 0 0 auto;
    width: auto;
    height: auto;
    padding: 0.125rem 0.5rem;
    font-size: var(--font-size-12, 0.75rem);
    line-height: 1.5;
  }
  .count {
    margin: 0.5rem 0 0;
    font-size: var(--font-size-12, 0.75rem);
    color: var(--color-text-secondary);
  }
</style>
