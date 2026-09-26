import { CORE_FACETS } from '@/search/records';
import type { FacetDef, SystemAdapter } from '@/search/types';
import { createPf2eAdapter } from './pf2e';

const ADAPTERS: Record<string, () => SystemAdapter> = {
  pf2e: createPf2eAdapter,
};

/** Core facets plus the active system's, when an adapter exists for it. */
export function activeFacets(): FacetDef[] {
  const systemId = game.system?.id;
  const adapter = systemId ? ADAPTERS[systemId]?.() : undefined;
  return [...CORE_FACETS, ...(adapter?.facets ?? [])];
}
