import { MODULE_ID } from '@/constants';
import type { SystemAdapter } from '@/search/types';

// The subset of PF2e's ChatMessageFlagsPF2e (pf2e src/module/chat-message/data.ts) this adapter reads.
interface Pf2eFlags {
  context?: {
    type?: string;
    outcome?: string | null;
    target?: { actor?: string; token?: string } | null;
    traits?: string[];
    options?: string[];
  } | null;
  origin?: { uuid?: string; type?: string } | null;
  casting?: object | null;
  damageRoll?: { types?: Record<string, unknown>; traits?: string[] } | null;
}

export interface FlaggedMessage {
  flags: object;
}

type NameResolver = (uuid: string) => string | null;

function pf2e(message: FlaggedMessage): Pf2eFlags {
  return ((message.flags as Record<string, unknown>).pf2e ?? {}) as Pf2eFlags;
}

function localizeOr(key: string | undefined, fallback: string): string {
  if (!key || !game.i18n) return fallback;
  const text = game.i18n.localize(key);
  return text === key ? fallback : text;
}

function humanize(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function pf2eConfig<T = string>(dictionary: string): Record<string, T> | undefined {
  return (CONFIG as unknown as { PF2E?: Record<string, Record<string, T>> }).PF2E?.[dictionary];
}

const STATISTIC_OPTION = /^check:statistic:(?!base:)(.+)$/;

function checkLabel(slug: string): string {
  const key =
    pf2eConfig<{ label: string }>('skills')?.[slug]?.label ??
    pf2eConfig('saves')?.[slug] ??
    `${MODULE_ID}.pf2e.check.${slug}`;
  return localizeOr(key, humanize(slug));
}

const defaultResolver: NameResolver = (uuid) =>
  (foundry.utils.fromUuidSync(uuid) as { name?: string } | null)?.name ?? null;

export function createPf2eAdapter(resolveName: NameResolver = defaultResolver): SystemAdapter<FlaggedMessage> {
  const names = new Map<string, string | null>();
  const nameOf = (uuid: string | undefined): string[] => {
    if (!uuid) return [];
    if (!names.has(uuid)) names.set(uuid, resolveName(uuid));
    const name = names.get(uuid);
    return name ? [name] : [];
  };

  return {
    systemId: 'pf2e',
    facets: [
      {
        key: 'kind',
        label: `${MODULE_ID}.facet.kind`,
        values: (m) => {
          const flags = pf2e(m);
          const isSpell = flags.origin?.type === 'spell' || !!flags.casting || flags.context?.type === 'spell-cast';
          return isSpell ? ['spell'] : [];
        },
      },
      {
        key: 'pf2e.rollType',
        label: `${MODULE_ID}.pf2e.facet.rollType`,
        values: (m) => {
          const type = pf2e(m).context?.type;
          return type ? [type] : [];
        },
        valueLabel: (v) => localizeOr(`${MODULE_ID}.pf2e.rollType.${v}`, humanize(v)),
      },
      {
        key: 'pf2e.check',
        label: `${MODULE_ID}.pf2e.facet.check`,
        values: (m) => {
          const options = pf2e(m).context?.options ?? [];
          return options.flatMap((o) => STATISTIC_OPTION.exec(o)?.[1] ?? []);
        },
        valueLabel: checkLabel,
      },
      {
        key: 'pf2e.outcome',
        label: `${MODULE_ID}.pf2e.facet.outcome`,
        values: (m) => {
          const outcome = pf2e(m).context?.outcome;
          return outcome ? [outcome] : [];
        },
        valueLabel: (v) => localizeOr(`${MODULE_ID}.pf2e.outcome.${v}`, humanize(v)),
      },
      {
        key: 'pf2e.target',
        label: `${MODULE_ID}.pf2e.facet.target`,
        values: (m) => {
          const target = pf2e(m).context?.target;
          return nameOf(target?.token ?? target?.actor);
        },
      },
      {
        key: 'pf2e.item',
        label: `${MODULE_ID}.pf2e.facet.item`,
        values: (m) => nameOf(pf2e(m).origin?.uuid),
      },
      {
        key: 'pf2e.damageType',
        label: `${MODULE_ID}.pf2e.facet.damageType`,
        values: (m) => Object.keys(pf2e(m).damageRoll?.types ?? {}),
        valueLabel: (v) => localizeOr(pf2eConfig('damageTypes')?.[v], humanize(v)),
      },
      {
        key: 'pf2e.trait',
        label: `${MODULE_ID}.pf2e.facet.trait`,
        values: (m) => {
          const flags = pf2e(m);
          return [...new Set([...(flags.context?.traits ?? []), ...(flags.damageRoll?.traits ?? [])])];
        },
        valueLabel: (v) => localizeOr(pf2eConfig('actionTraits')?.[v], humanize(v)),
      },
    ],
  };
}
