import { CORE_FACETS } from '@/search/records';
import type { FacetDef, SystemAdapter } from '@/search/types';
import { createPf2eAdapter } from './pf2e';

const ADAPTERS: Record<string, () => SystemAdapter> = {
  pf2e: createPf2eAdapter,
};

/**
 * Core facets plus the active system's. An adapter facet that reuses a core key adds its
 * values to that facet (PF2e adds "spell" to Type) and falls back to the core labels.
 */
export function mergeFacets<M>(core: readonly FacetDef<M>[], extra: readonly FacetDef<M>[]): FacetDef<M>[] {
  const merged = new Map(core.map((f) => [f.key, f]));
  for (const facet of extra) {
    const base = merged.get(facet.key);
    if (!base) {
      merged.set(facet.key, facet);
      continue;
    }
    merged.set(facet.key, {
      ...base,
      values: (m) => [...base.values(m), ...facet.values(m)],
      valueLabel: base.valueLabel ?? facet.valueLabel,
    });
  }
  return [...merged.values()];
}

export function activeFacets(): FacetDef[] {
  const systemId = game.system?.id;
  const adapter = systemId ? ADAPTERS[systemId]?.() : undefined;
  return mergeFacets(CORE_FACETS, adapter?.facets ?? []);
}
