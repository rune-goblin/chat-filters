/** A roll a card asks for. `item` and `dc` tell its rolls from those of another prompt for the same statistic. */
export interface Prompt {
  statistic: string;
  dc?: number;
  item?: string;
}

/** A roll on record: a check posted to chat, or a save pf2e-toolbelt stored on its card. */
export interface Answer extends Prompt {
  /** Token id of the roller. */
  roller?: string;
}

export interface PromptCard {
  prompts: Prompt[];
  /** Token ids of the creatures the card lists to roll; empty when it names none. */
  rollers: string[];
  answers: Answer[];
}

// The subset of pf2e-toolbelt's Target Helper flag (its src/tools/target-helper) this adapter reads.
interface TargetHelperFlag {
  type?: string;
  item?: string | null;
  targets?: string[];
  saveVariants?: Record<string, { statistic?: string; dc?: number; saves?: Record<string, unknown> } | null>;
}

export interface TargetRows {
  item?: string;
  /** Token ids of the targets that still exist; toolbelt draws a row for each. */
  targets: string[];
  saves: { statistic: string; dc?: number; saved: string[] }[];
  /** A damage card, whose save buttons exist only in toolbelt's rows. */
  damage: boolean;
}

// Toolbelt also flags targets on action and spell-variant cards, where it draws no rows.
const ROW_TYPES = new Set(['damage', 'spell', 'check']);

export function targetRows(flags: object, exists: (uuid: string) => boolean): TargetRows | null {
  const flag = (flags as { 'pf2e-toolbelt'?: { targetHelper?: TargetHelperFlag } })['pf2e-toolbelt']?.targetHelper;
  if (!flag?.type || !ROW_TYPES.has(flag.type)) return null;
  return {
    item: flag.item ?? undefined,
    targets: (flag.targets ?? []).filter(exists).map((uuid) => uuid.slice(uuid.lastIndexOf('.') + 1)),
    saves: Object.values(flag.saveVariants ?? {}).flatMap((variant) =>
      variant?.statistic ? { statistic: variant.statistic, dc: variant.dc, saved: Object.keys(variant.saves ?? {}) } : [],
    ),
    damage: flag.type === 'damage',
  };
}

function numeric(value: string | undefined): number | undefined {
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** The save button of a spell card and the inline check links of any card, as PF2e stores them. */
export function storedPrompts(root: ParentNode, item?: string): Prompt[] {
  const prompts: Prompt[] = [];
  for (const button of root.querySelectorAll<HTMLElement>('button[data-action="spell-save"][data-save]')) {
    prompts.push({ statistic: button.dataset.save!, dc: numeric(button.dataset.dc), item });
  }
  for (const link of root.querySelectorAll<HTMLElement>('a.inline-check[data-pf2-check]')) {
    prompts.push({ statistic: link.dataset.pf2Check!, dc: numeric(link.dataset.pf2Dc), item: link.dataset.itemUuid ?? item });
  }
  // PF2e enriches a typed message and a roll note at render, so both store the raw link.
  for (const [, body] of (root.textContent ?? '').matchAll(/@Check\[([^\]]+)\]/g)) {
    const [statistic, ...params] = body.split('|');
    const dc = params.find((param) => param.startsWith('dc:'))?.slice(3);
    prompts.push({ statistic: statistic.replace(/^type:/, ''), dc: numeric(dc), item });
  }
  return prompts;
}

function answers(answer: Prompt, prompt: Prompt): boolean {
  if (answer.statistic !== prompt.statistic) return false;
  if (prompt.item && answer.item) return prompt.item === answer.item;
  if (prompt.dc !== undefined && answer.dc !== undefined) return prompt.dc === answer.dc;
  return !prompt.item && prompt.dc === undefined;
}

/**
 * The statistics each card still awaits, for cards in log order. A card that lists its rollers
 * awaits each of them; any other card awaits a single roll. Only a roll at or after the card
 * answers it, so a second cast of a spell asks again.
 */
export function awaitedRolls(cards: readonly PromptCard[]): string[][] {
  const rolls = new Map<string, (Answer & { at: number })[]>();
  cards.forEach((card, at) => {
    for (const answer of card.answers) {
      if (!rolls.has(answer.statistic)) rolls.set(answer.statistic, []);
      rolls.get(answer.statistic)!.push({ ...answer, at });
    }
  });
  return cards.map((card, at) => {
    const answered = (prompt: Prompt, roller?: string) =>
      (rolls.get(prompt.statistic) ?? []).some(
        (roll) => roll.at >= at && (roller === undefined || roll.roller === roller) && answers(roll, prompt),
      );
    const awaited = card.prompts.filter((prompt) =>
      card.rollers.length ? card.rollers.some((roller) => !answered(prompt, roller)) : !answered(prompt),
    );
    return [...new Set(awaited.map((prompt) => prompt.statistic))];
  });
}
