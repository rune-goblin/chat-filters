import type { BrowserContext, Page } from '@playwright/test';
import { MODULE_ID, expect, joinAs, newFoundryContext, test, waitForModuleActive } from './fixtures/foundry-clients';

const PUBLIC = '__e2e_public_marker';
const WHISPER = '__e2e_whisper_marker';
const BLIND = '__e2e_blind_marker';
const DC = '__e2e_dc_marker';

interface Seeded {
  playerId: string;
  messageIds: Record<'public' | 'whisper' | 'blind', string>;
}

let seeded: Seeded;
let playerContext: BrowserContext;
let playerPage: Page;

async function matches(page: Page, text: string): Promise<string[]> {
  return page.evaluate(
    ({ id, text }) => {
      const search = game.modules.get(id).api.search;
      search.text = text;
      const ids = search.results.map((r: { id: string }) => r.id);
      search.reset();
      return ids;
    },
    { id: MODULE_ID, text },
  );
}

async function record(page: Page, messageId: string) {
  return page.evaluate(
    ({ id, messageId }) => {
      const found = game.modules.get(id).api.search.index.records.find((r: { id: string }) => r.id === messageId);
      return found ? { haystack: found.haystack as string, facets: Object.keys(found.facets).sort() } : null;
    },
    { id: MODULE_ID, messageId },
  );
}

test.beforeAll(async ({ gmPage, browser }) => {
  seeded = await gmPage.evaluate(
    async ({ PUBLIC, WHISPER, BLIND, DC }) => {
      const gm = game.user;
      // v14 joins by typed name, so a leftover user with the same name would be ambiguous.
      const name = `__e2e_player_${foundry.utils.randomID(6)}`;
      const player = await foundry.documents.User.create({ name, role: CONST.USER_ROLES.PLAYER });
      const roll = await new foundry.dice.Roll('1d1 + 41').evaluate();
      // One at a time: a batch create can resolve its documents out of order.
      const create = (data: object) => foundry.documents.ChatMessage.create(data);
      const pub = await create({ content: `<p>${PUBLIC}</p>`, flavor: `<span data-visibility="gm">${DC}</span>` });
      const whisper = await create({ content: `<p>${WHISPER}</p>`, whisper: [gm.id] });
      const blind = await create({
        author: player.id,
        content: `<p>${BLIND}</p>`,
        rolls: [roll.toJSON()],
        whisper: [gm.id],
        blind: true,
      });
      return { playerId: player.id, messageIds: { public: pub.id, whisper: whisper.id, blind: blind.id } };
    },
    { PUBLIC, WHISPER, BLIND, DC },
  );

  playerContext = await newFoundryContext(browser);
  playerPage = await playerContext.newPage();
  await joinAs(playerPage, seeded.playerId);
  await waitForModuleActive(playerPage);
});

test.afterAll(async ({ gmPage }) => {
  await playerContext?.close();
  if (!seeded) return;
  await gmPage.evaluate(async ({ playerId, messageIds }) => {
    await foundry.documents.ChatMessage.deleteDocuments(Object.values(messageIds));
    await foundry.documents.User.deleteDocuments([playerId]);
  }, seeded);
});

test('a player gets the search bar and can find public messages', async () => {
  await expect(playerPage.locator(`#chat .${MODULE_ID}-bar`)).toBeVisible();
  await expect.poll(() => matches(playerPage, PUBLIC)).toEqual([seeded.messageIds.public]);
});

test('a player cannot find a whisper sent to someone else', async ({ gmPage }) => {
  expect(await matches(playerPage, WHISPER)).toEqual([]);
  expect(await record(playerPage, seeded.messageIds.whisper)).toBeNull();
  expect(await matches(gmPage, WHISPER)).toEqual([seeded.messageIds.whisper]);
});

test('a player sees only the header of their own blind roll', async ({ gmPage }) => {
  const own = await record(playerPage, seeded.messageIds.blind);
  expect(own?.facets).toEqual(['author', 'speaker', 'visibility']);
  expect(own?.haystack).not.toContain(BLIND.toLowerCase());
  expect(own?.haystack).not.toContain('42');
  expect(await matches(playerPage, BLIND)).toEqual([]);
  expect(await matches(gmPage, BLIND)).toEqual([seeded.messageIds.blind]);
});

test('typing a hidden term into the bar shows the player no results', async () => {
  await playerPage.evaluate((id) => game.modules.get(id).api.focus(), MODULE_ID);
  const input = playerPage.locator(`#chat .${MODULE_ID}-input`);
  await input.fill(WHISPER);
  await expect(playerPage.locator(`#chat .${MODULE_ID}-results .message`)).toHaveCount(0);
  await input.fill(PUBLIC);
  await expect(playerPage.locator(`#chat .${MODULE_ID}-results .message`)).toHaveCount(1);
  await input.fill('');
});

test('under PF2e a player cannot find gm-only flavor text', async ({ gmPage }) => {
  const system = await gmPage.evaluate(() => game.system.id);
  test.skip(system !== 'pf2e', 'data-visibility markup is PF2e-only');
  expect(await matches(playerPage, DC)).toEqual([]);
  expect(await matches(gmPage, DC)).toEqual([seeded.messageIds.public]);
});
