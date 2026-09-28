import type { Page } from '@playwright/test';
import { MODULE_ID, expect, test } from './fixtures/foundry-clients';

const SPELL = '__e2e_spellmark';

interface Seeded {
  spell: string;
  messages: { card: string; damage: string; mention: string };
}

let seeded: Seeded | undefined;

const input = (page: Page) => page.locator(`#chat .${MODULE_ID}-input`);
const results = (page: Page) => page.locator(`#chat .${MODULE_ID}-results .message`);
const options = (page: Page) => page.locator(`#${MODULE_ID}-suggestions li[role="option"]`);
const textRow = (page: Page) => page.locator(`#${MODULE_ID}-suggestions li[data-row="text"]`);
const spellRow = (page: Page) =>
  page.locator(`#${MODULE_ID}-suggestions li[data-row="filter"][data-value="${SPELL}"]`);

test.beforeEach(async ({ gmPage }) => {
  const system = await gmPage.evaluate(() => game.system.id);
  test.skip(system !== 'pf2e', 'The Item or spell filter comes from the PF2e adapter');

  seeded = await gmPage.evaluate(async (SPELL) => {
    const spell = await foundry.documents.Item.create({ name: SPELL, type: 'spell' });
    const origin = { type: 'spell', uuid: spell.uuid };
    const roll = await new foundry.dice.Roll('6d6').evaluate();
    // One at a time: a batch create can resolve its documents out of order.
    const create = (data: object) => foundry.documents.ChatMessage.create(data);
    const card = await create({
      content: `<p>${SPELL} card</p>`,
      flags: { pf2e: { origin, casting: { id: 'x', tradition: 'arcane' } } },
    });
    const damage = await create({
      content: `<p>${SPELL} damage</p>`,
      rolls: [roll.toJSON()],
      flags: { pf2e: { origin, context: { type: 'damage-roll' } } },
    });
    const mention = await create({ content: `<p>Remember ${SPELL} next round</p>` });
    return { spell: spell.id, messages: { card: card.id, damage: damage.id, mention: mention.id } };
  }, SPELL);

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
  await gmPage.evaluate(async ({ spell, messages }) => {
    await foundry.documents.ChatMessage.deleteDocuments(Object.values(messages));
    await foundry.documents.Item.deleteDocuments([spell]);
  }, seeded);
  seeded = undefined;
});

test('the dropdown lists the spell filter first and the text search last', async ({ gmPage }) => {
  await input(gmPage).fill(SPELL);
  await expect(options(gmPage)).toHaveCount(2);
  await expect(options(gmPage).first()).toHaveAttribute('data-value', SPELL);
  await expect(options(gmPage).last()).toHaveAttribute('data-row', 'text');
  await expect(spellRow(gmPage).locator('.n')).toHaveText('2');
  await expect(textRow(gmPage).locator('.n')).toHaveText('3');
});

test('the spell filter keeps only the messages that came from the spell', async ({ gmPage }) => {
  await input(gmPage).fill(SPELL);
  await spellRow(gmPage).dispatchEvent('pointerdown');
  await expect(input(gmPage)).toHaveValue('');
  await expect(gmPage.locator(`#chat .${MODULE_ID}-bar .chip`)).toHaveCount(1);
  await expect(results(gmPage)).toHaveCount(2);
  const mention = `#chat .${MODULE_ID}-results .message[data-message-id="${seeded!.messages.mention}"]`;
  await expect(gmPage.locator(mention)).toHaveCount(0);
});

test('the text row keeps every message that mentions the words', async ({ gmPage }) => {
  await input(gmPage).fill(SPELL);
  await textRow(gmPage).dispatchEvent('pointerdown');
  await expect(gmPage.locator(`#${MODULE_ID}-suggestions`)).toHaveCount(0);
  await expect(input(gmPage)).toHaveValue(SPELL);
  await expect(results(gmPage)).toHaveCount(3);
});

test('retyping text the dropdown was dismissed for opens it again', async ({ gmPage }) => {
  await input(gmPage).fill(SPELL);
  await input(gmPage).press('Escape');
  await expect(gmPage.locator(`#${MODULE_ID}-suggestions`)).toHaveCount(0);
  await input(gmPage).fill('');
  await input(gmPage).fill(SPELL);
  await expect(options(gmPage)).toHaveCount(2);
});

test('Enter picks the spell filter, and ArrowDown then Enter picks the text search', async ({ gmPage }) => {
  await input(gmPage).fill(SPELL);
  await expect(options(gmPage)).toHaveCount(2);
  await input(gmPage).press('Enter');
  await expect(results(gmPage)).toHaveCount(2);

  await gmPage.evaluate((id) => game.modules.get(id).api.search.reset(), MODULE_ID);
  await input(gmPage).fill(SPELL);
  await expect(options(gmPage)).toHaveCount(2);
  await input(gmPage).press('ArrowDown');
  await input(gmPage).press('Enter');
  await expect(results(gmPage)).toHaveCount(3);
});
