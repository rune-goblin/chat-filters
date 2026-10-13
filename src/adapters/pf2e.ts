import { MODULE_ID } from '@/constants';
import type { SystemAdapter } from '@/search/types';
import { awaitedRolls, storedPrompts, targetRows, type Answer, type Prompt, type PromptCard } from './pf2e-prompts';

// The subset of PF2e's ChatMessageFlagsPF2e (pf2e src/module/chat-message/data.ts) this adapter reads.
interface Pf2eFlags {
  context?: {
    type?: string;
    outcome?: string | null;
    target?: { actor?: string; token?: string } | null;
    traits?: string[];
    options?: string[];
    dc?: { value?: number } | null;
  } | null;
  origin?: { uuid?: string; type?: string } | null;
  casting?: object | null;
}

// The subset of PF2e's DamageRoll (pf2e src/module/system/damage/roll.ts) this adapter reads; other rolls lack `instances`.
interface DamageRoll {
  options?: Record<string, unknown>;
  instances?: { type?: string; persistent?: boolean }[];
  kinds?: Set<string>;
}

interface OwnedDoc {
  isOwner?: boolean;
  hasPlayerOwner?: boolean;
  getCondition?(slug: string): unknown;
}

interface NamedToken {
  name?: string;
  displayName?: number;
  playersCanSeeName?: boolean;
  actor?: OwnedDoc | null;
}

export interface FlaggedMessage {
  flags: object;
  id?: string | null;
  flavor?: string;
  content?: string;
  speaker?: { token?: string | null; actor?: string | null };
  alias?: string;
  author?: { name?: string } | null;
  isOwner?: boolean;
  actor?: (OwnedDoc & { prototypeToken?: NamedToken }) | null;
  token?: NamedToken | null;
  target?: { actor?: OwnedDoc | null } | null;
  rolls?: DamageRoll[];
  speakerActor?: OwnedDoc | null;
}

/** The PF2e metagame settings that decide what players see; GMs see everything. */
export interface Pf2eViewer {
  isGM: boolean;
  showResults: boolean;
  tokenNames: boolean;
  /** pf2e-toolbelt draws its target rows, with their save buttons and results, on this user's cards. */
  targetRows?: boolean;
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

/**
 * Mirrors ChatMessagePF2e#renderHTML, which adds the button to a persistent damage card for as
 * long as its speaker keeps the condition.
 */
export function offersRecoveryCheck(message: FlaggedMessage): boolean {
  return !!recoverySlug(message);
}

function recoverySlug(message: FlaggedMessage): string | undefined {
  const roll = message.rolls?.[0];
  if (!roll?.options?.evaluatePersistent) return undefined;
  const type = roll.instances?.find((instance) => instance.persistent)?.type;
  const actor = message.speakerActor;
  const slug = `persistent-damage-${type}`;
  return type && actor?.isOwner && actor.getCondition?.(slug) ? slug : undefined;
}

// PF2e's own strings, so a label reads as its button does in any language.
const BUTTON_LABELS: Record<string, string> = {
  'recovery-check': 'PF2E.Item.Condition.PersistentDamage.Chat.Recover',
  'apply-healing': 'PF2E.Damage.Kind.Healing.Apply.Label',
};

const STATISTIC_OPTION = /^check:statistic:(?!base:)(.+)$/;
const RECOVERY = 'pd-recovery';
// A recovery check carries its condition's roll options, the damage type among them.
const RECOVERY_TYPE_OPTION = /^item:damage:type:(.+)$/;
const PROMPT_MARKUP = /spell-save|inline-check|@Check\[/;

function rolledStatistic(flags: Pf2eFlags): string | undefined {
  for (const option of flags.context?.options ?? []) {
    const statistic = STATISTIC_OPTION.exec(option)?.[1];
    if (statistic) return statistic;
  }
  return undefined;
}

const rollerOf = (message: FlaggedMessage) => message.speaker?.token ?? message.speaker?.actor ?? undefined;

function checkLabel(slug: string): string {
  const key =
    pf2eConfig<{ label: string }>('skills')?.[slug]?.label ??
    pf2eConfig('saves')?.[slug] ??
    `${MODULE_ID}.pf2e.check.${slug}`;
  return localizeOr(key, humanize(slug));
}

const currentViewer = (): Pf2eViewer => {
  const settings = (game as { pf2e?: { settings?: Pf2eSettings } }).pf2e?.settings;
  const isGM = !!game.user?.isGM;
  return {
    isGM,
    showResults: settings?.metagame?.results ?? true,
    tokenNames: settings?.tokens?.nameVisibility ?? false,
    // Toolbelt hides rows and names from players by rules of its own, so only the GM's are read.
    targetRows: isGM && !!game.modules?.get('pf2e-toolbelt')?.active,
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

  const redact = (root: ParentNode, m: FlaggedMessage) => {
    for (const el of root.querySelectorAll<HTMLElement>('[data-visibility]')) {
      if (!playerSeesElement(el.dataset, m)) el.remove();
    }
  };

  // Every build reads every card, so a card is parsed once per text; PF2e swaps in an enriched flavor at render.
  const parsed = new WeakMap<FlaggedMessage, { flavor?: string; content?: string; prompts: Prompt[] }>();
  const storedPromptsOf = (m: FlaggedMessage): Prompt[] => {
    const cached = parsed.get(m);
    if (cached && cached.flavor === m.flavor && cached.content === m.content) return cached.prompts;
    const html = `${m.flavor ?? ''}${m.content ?? ''}`;
    let prompts: Prompt[] = [];
    if (PROMPT_MARKUP.test(html)) {
      const template = document.createElement('template');
      template.innerHTML = html;
      if (!viewer().isGM) redact(template.content, m);
      prompts = storedPrompts(template.content, pf2e(m).origin?.uuid);
    }
    parsed.set(m, { flavor: m.flavor, content: m.content, prompts });
    return prompts;
  };

  const rowsOf = (m: FlaggedMessage) => (viewer().targetRows ? targetRows(m.flags, (uuid) => resolveName(uuid) !== null) : null);

  const promptsOf = (m: FlaggedMessage, rows = rowsOf(m)): Prompt[] => {
    const stored = storedPromptsOf(m);
    if (!rows?.damage || !rows.targets.length) return stored;
    const item = rows.item ?? pf2e(m).origin?.uuid;
    return [...stored, ...rows.saves.map(({ statistic, dc }) => ({ statistic, dc, item }))];
  };

  const cardOf = (m: FlaggedMessage): PromptCard => {
    const flags = pf2e(m);
    const rows = rowsOf(m);
    const prompts = promptsOf(m, rows);
    const answers: Answer[] = [];
    const rolled = rolledStatistic(flags);
    if (rolled === RECOVERY) {
      const type = flags.context?.options?.flatMap((option) => RECOVERY_TYPE_OPTION.exec(option)?.[1] ?? [])[0];
      answers.push({ statistic: RECOVERY, item: `persistent-damage-${type}`, roller: rollerOf(m) });
    } else if (rolled) {
      answers.push({ statistic: rolled, dc: flags.context?.dc?.value, item: flags.origin?.uuid, roller: rollerOf(m) });
    }
    for (const { statistic, dc, saved } of rows?.saves ?? []) {
      const item = rows?.item ?? flags.origin?.uuid ?? prompts.find((prompt) => prompt.statistic === statistic)?.item;
      for (const roller of saved) answers.push({ statistic, dc, item, roller });
    }
    const recovery = recoverySlug(m);
    const roller = rollerOf(m);
    if (recovery && roller) return { prompts: [{ statistic: RECOVERY, item: recovery }], rollers: [roller], answers };
    return { prompts, rollers: prompts.length ? (rows?.targets ?? []) : [], answers };
  };

  const awaited = new Map<string, string[]>();

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
          // Persistent damage, regeneration and item healing are damage rolls posted without a context.
          const type = pf2e(m).context?.type ?? (m.rolls?.[0]?.instances ? 'damage-roll' : undefined);
          return type ? [type] : [];
        },
        valueLabel: (v) => localizeOr(`${MODULE_ID}.pf2e.rollType.${v}`, humanize(v)),
      },
      {
        // Buttons PF2e adds when it renders the card; the stored message holds none of their text.
        key: 'pf2e.button',
        label: `${MODULE_ID}.pf2e.facet.button`,
        values: (m) => [
          ...(offersRecoveryCheck(m) ? ['recovery-check'] : []),
          ...(m.rolls?.some((roll) => roll.kinds?.has('healing')) ? ['apply-healing'] : []),
        ],
        valueLabel: (v) => localizeOr(BUTTON_LABELS[v], humanize(v)),
        printed: true,
        live: true,
      },
      {
        // Cards that ask for a save or check: a spell's save button, an inline check link, toolbelt's save rows.
        key: 'pf2e.prompt',
        label: `${MODULE_ID}.pf2e.facet.prompt`,
        values: (m) => [...new Set(promptsOf(m).map((prompt) => prompt.statistic))],
        valueLabel: checkLabel,
        live: true,
      },
      {
        key: 'pf2e.awaiting',
        label: `${MODULE_ID}.pf2e.facet.awaiting`,
        values: (m) => (m.id && awaited.get(m.id)) || [],
        valueLabel: (v) => (v === RECOVERY ? localizeOr(BUTTON_LABELS['recovery-check'], checkLabel(v)) : checkLabel(v)),
        live: true,
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
        values: (m) => [
          ...new Set((m.rolls ?? []).flatMap((roll) => (roll.instances ?? []).flatMap((instance) => instance.type ?? []))),
        ],
        valueLabel: (v) => localizeOr(pf2eConfig('damageTypes')?.[v], humanize(v)),
      },
      {
        key: 'pf2e.trait',
        label: `${MODULE_ID}.pf2e.facet.trait`,
        values: (m) => pf2e(m).context?.traits ?? [],
        valueLabel: (v) => localizeOr(pf2eConfig('actionTraits')?.[v], humanize(v)),
      },
    ],
    // A condition is an item, so the recovery button comes and goes with these; a save row goes with its token.
    refreshOn: ['createItem', 'deleteItem', 'deleteToken'],
    // GM only: a player's index lacks toolbelt's save records, so their prompts would all read as unanswered.
    prepare: (messages) => {
      awaited.clear();
      if (!viewer().isGM) return;
      awaitedRolls(messages.map(cardOf)).forEach((statistics, i) => {
        const id = messages[i].id;
        if (id && statistics.length) awaited.set(id, statistics);
      });
    },
    redactor: {
      speaker: (m) => {
        if (!viewer().tokenNames) return null;
        const token = m.token ?? (m.actor?.prototypeToken ? { ...m.actor.prototypeToken, actor: m.actor } : null);
        const name = token?.name?.trim();
        if (!token || !name || playersCanSeeName(token) || !m.alias?.includes(name)) return null;
        return m.author?.name ?? game.i18n?.localize('USER.RoleGamemaster') ?? '';
      },
      content: redact,
    },
  };
}
