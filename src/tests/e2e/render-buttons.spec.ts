import type { Page } from '@playwright/test';
import { MODULE_ID, expect, test } from './fixtures/foundry-clients';

const ACTOR = '__e2e_burning';
const RECOVER = 'button[data-action="recoverPersistentDamage"]';
const HEAL = 'button.healing-only[data-action="applyDamage"]';

interface Seeded {
  actor: string;
  messages: { burning: string; healing: string };
}

let seeded: Seeded | undefined;

const input = (page: Page) => page.locator(`#chat .${MODULE_ID}-input`);
const results = (page: Page) => page.locator(`#chat .${MODULE_ID}-results .message`);
const result = (page: Page, id: string) => page.locator(`#chat .${MODULE_ID}-results .message[data-message-id="${id}"]`);
const buttonRow = (page: Page, value: string) =>
  page.locator(`#${MODULE_ID}-suggestions li[data-row="filter"][data-value="${value}"]`);
const facetsOf = (page: Page, id: string) =>
  page.evaluate(
    ([module, message]) => game.modules.get(module).api.search.index.records.find((r: { id: string }) => r.id === message)?.facets,
    [MODULE_ID, id],
  );

test.beforeEach(async ({ gmPage }) => {
  const system = await gmPage.evaluate(() => game.system.id);
  test.skip(system !== 'pf2e', 'The Button filter comes from the PF2e adapter');

  seeded = await gmPage.evaluate(async (ACTOR) => {
    const actor = await foundry.documents.Actor.create({ name: ACTOR, type: 'npc' });
    const source = game.pf2e.ConditionManager.getCondition('persistent-damage').toObject();
    source.system.persistent = { formula: '1d4', damageType: 'fire', dc: 15 };
    await actor.createEmbeddedDocuments('Item', [source]);
    // PF2e posts this card itself at the end of the burning creature's turn.
    await actor.getCondition('persistent-damage-fire').onEndTurn();
    const burning = game.messages.contents.at(-1);

    const DamageRoll = CONFIG.Dice.rolls.find((roll: { name: string }) => roll.name === 'DamageRoll');
    const healing = await new DamageRoll('2d8[healing]').toMessage({ flavor: `${ACTOR} regenerates` });
    return { actor: actor.id, messages: { burning: burning.id, healing: healing.id } };
  }, ACTOR);

  // The GM's sidebar may open on another tab, which hides the search input.
  await gmPage.evaluate((id) => {
    const api = game.modules.get(id).api;
    api.search.reset();
    api.focus();
  }, MODULE_ID);
});

test.afterEach(async ({ gmPage }) => {
  await gmPage.evaluate((id) => game.modules.get(id).api.search.reset(), MODULE_ID);
  if (!seeded) return;
  await gmPage.evaluate(async ({ actor, messages }) => {
    await foundry.documents.ChatMessage.deleteDocuments(Object.values(messages));
    await foundry.documents.Actor.deleteDocuments([actor]);
  }, seeded);
  seeded = undefined;
});

test('typing recovery offers a filter that keeps the cards with the recovery button', async ({ gmPage }) => {
  await input(gmPage).fill('recovery');
  await buttonRow(gmPage, 'recovery-check').dispatchEvent('pointerdown');
  await expect(result(gmPage, seeded!.messages.burning).locator(RECOVER)).toBeVisible();
  await expect(result(gmPage, seeded!.messages.healing)).toHaveCount(0);
  // The filter mirrors PF2e's own render, so every card it keeps carries the button.
  await expect(results(gmPage).filter({ hasNot: gmPage.locator(RECOVER) })).toHaveCount(0);
});

test('a text search for the button words finds the card', async ({ gmPage }) => {
  const label = await gmPage.evaluate(() => game.i18n.localize('PF2E.Item.Condition.PersistentDamage.Chat.Recover'));
  await input(gmPage).fill(`"${label}"`);
  await expect(result(gmPage, seeded!.messages.burning)).toBeVisible();
});

test('the card leaves the filter when the persistent damage ends', async ({ gmPage }) => {
  await input(gmPage).fill('recovery');
  await buttonRow(gmPage, 'recovery-check').dispatchEvent('pointerdown');
  await expect(result(gmPage, seeded!.messages.burning)).toBeVisible();

  await gmPage.evaluate((id) => game.actors.get(id).getCondition('persistent-damage-fire').delete(), seeded!.actor);
  await expect(result(gmPage, seeded!.messages.burning)).toHaveCount(0);
});

test('the persistent damage card is filed as a fire damage roll', async ({ gmPage }) => {
  await expect.poll(() => facetsOf(gmPage, seeded!.messages.burning)).toMatchObject({
    'pf2e.rollType': ['damage-roll'],
    'pf2e.damageType': ['fire'],
    'pf2e.button': ['recovery-check'],
  });
});

test('typing heal offers a filter that keeps the cards with the healing button', async ({ gmPage }) => {
  await input(gmPage).fill('heal');
  await buttonRow(gmPage, 'apply-healing').dispatchEvent('pointerdown');
  await expect(result(gmPage, seeded!.messages.healing).locator(HEAL)).toBeVisible();
  await expect(result(gmPage, seeded!.messages.burning)).toHaveCount(0);
});
