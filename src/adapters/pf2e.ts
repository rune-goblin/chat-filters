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

interface OwnedDoc {
  isOwner?: boolean;
  hasPlayerOwner?: boolean;
}

interface NamedToken {
  name?: string;
  displayName?: number;
  playersCanSeeName?: boolean;
  actor?: OwnedDoc | null;
}

export interface FlaggedMessage {
  flags: object;
  alias?: string;
  author?: { name?: string } | null;
  isOwner?: boolean;
  actor?: (OwnedDoc & { prototypeToken?: NamedToken }) | null;
  token?: NamedToken | null;
  target?: { actor?: OwnedDoc | null } | null;
}

/** The PF2e metagame settings that decide what players see; GMs see everything. */
export interface Pf2eViewer {
  isGM: boolean;
  showResults: boolean;
  tokenNames: boolean;
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

/** The card a spell posts when cast or shared; its attack, damage and save rolls carry other context types. */
export function isSpellCard(flags: Pf2eFlags): boolean {
  if (flags.origin?.type !== 'spell') return false;
  const type = flags.context?.type;
  return !type || type === 'spell-cast';
}

const STATISTIC_OPTION = /^check:statistic:(?!base:)(.+)$/;

function checkLabel(slug: string): string {
  const key =
    pf2eConfig<{ label: string }>('skills')?.[slug]?.label ??
    pf2eConfig('saves')?.[slug] ??
    `${MODULE_ID}.pf2e.check.${slug}`;
  return localizeOr(key, humanize(slug));
}

const currentViewer = (): Pf2eViewer => {
  const settings = (game as { pf2e?: { settings?: Pf2eSettings } }).pf2e?.settings;
  return {
    isGM: !!game.user?.isGM,
    showResults: settings?.metagame?.results ?? true,
    tokenNames: settings?.tokens?.nameVisibility ?? false,
  };
};

interface Pf2eSettings {
  metagame?: { results?: boolean };
  tokens?: { nameVisibility?: boolean };
}

/** Mirrors TokenDocumentPF2e#playersCanSeeName, which a prototype token lacks. */
export function playersCanSeeName(token: NamedToken): boolean {
  if (token.playersCanSeeName !== undefined) return token.playersCanSeeName;
  const { ALWAYS, HOVER } = CONST.TOKEN_DISPLAY_MODES;
  return token.displayName === ALWAYS || token.displayName === HOVER || !!token.actor?.hasPlayerOwner;
}

function resolverFor(viewer: () => Pf2eViewer): NameResolver {
  return (uuid) => {
    const doc = foundry.utils.fromUuidSync(uuid) as (NamedToken & OwnedDoc & { documentName?: string; prototypeToken?: NamedToken }) | null;
    if (!doc?.name) return null;
    const { isGM, tokenNames } = viewer();
    if (isGM || !tokenNames) return doc.name;
    const token = doc.documentName === 'Actor' ? { ...doc.prototypeToken, actor: doc } : doc;
    return playersCanSeeName(token) ? doc.name : null;
  };
}

/**
 * Mirrors UserVisibilityPF2e.process for a player: `gm` and `none` elements go, and an `owner`
 * element stays only when PF2e would show it to this player.
 */
export function playerSeesElement(data: DOMStringMap, message: FlaggedMessage): boolean {
  const doc = message.actor ?? message;
  switch (data.visibility) {
    case 'gm':
    case 'none':
      return false;
    case 'owner': {
      if (data.action) return !!doc.isOwner;
      const whose = data.whose ?? 'self';
      if (whose === 'self') return !!message.actor?.hasPlayerOwner;
      if (whose === 'opposer' && message.target) return !!message.target.actor?.hasPlayerOwner;
      return !!doc.isOwner;
    }
    default:
      return true;
  }
}

export function createPf2eAdapter(
  resolveName?: NameResolver,
  viewer: () => Pf2eViewer = currentViewer,
): SystemAdapter<FlaggedMessage> {
  resolveName ??= resolverFor(viewer);
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
        values: (m) => (isSpellCard(pf2e(m)) ? ['spell'] : []),
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
          const { isGM, showResults } = viewer();
          return outcome && (isGM || showResults) ? [outcome] : [];
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
    redactor: {
      speaker: (m) => {
        if (!viewer().tokenNames) return null;
        const token = m.token ?? (m.actor?.prototypeToken ? { ...m.actor.prototypeToken, actor: m.actor } : null);
        const name = token?.name?.trim();
        if (!token || !name || playersCanSeeName(token) || !m.alias?.includes(name)) return null;
        return m.author?.name ?? game.i18n?.localize('USER.RoleGamemaster') ?? '';
      },
      content: (root, m) => {
        for (const el of root.querySelectorAll<HTMLElement>('[data-visibility]')) {
          if (!playerSeesElement(el.dataset, m)) el.remove();
        }
      },
    },
  };
}
