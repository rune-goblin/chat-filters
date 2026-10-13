import type { BrowserContext, Page } from '@playwright/test';
import { MODULE_ID, expect, joinAs, newFoundryContext, test, waitForModuleActive } from './fixtures/foundry-clients';

const NAME = '__e2e_prompted';
// No other card in the world asks for a roll against this DC.
const DC = 23;
const RECOVER = 'button[data-action="recoverPersistentDamage"]';

interface Seeded {
  actor: string;
  scene: string;
  token: string;
  prompt: string;
}

let seeded: Seeded | undefined;
const extra: string[] = [];

const input = (page: Page) => page.locator(`#chat .${MODULE_ID}-input`);
const result = (page: Page, id: string) => page.locator(`#chat .${MODULE_ID}-results .message[data-message-id="${id}"]`);
const facetsOf = (page: Page, id: string): Promise<Record<string, string[]> | undefined> =>
  page.evaluate(
    ([module, message]) => game.modules.get(module).api.search.index.records.find((r: { id: string }) => r.id === message)?.facets,
    [MODULE_ID, id],
  );

async function pick(page: Page, typed: string, facet: 'prompt' | 'awaiting' | 'button', value: string): Promise<void> {
  const label = await page.evaluate((key) => game.i18n.localize(key), `${MODULE_ID}.pf2e.facet.${facet}`);
  await input(page).fill(typed);
  await page
    .locator(`#${MODULE_ID}-suggestions li[data-row="filter"][data-value="${value}"]`)
    .filter({ has: page.locator('.facet', { hasText: label }) })
    .dispatchEvent('pointerdown');
}

const reset = (page: Page) => page.evaluate((id) => game.modules.get(id).api.search.reset(), MODULE_ID);

test.beforeEach(async ({ gmPage }) => {
  const system = await gmPage.evaluate(() => game.system.id);
  test.skip(system !== 'pf2e', 'The Prompt and Awaiting roll filters come from the PF2e adapter');

  seeded = await gmPage.evaluate(
    async ({ NAME, DC }) => {
      const actor = await foundry.documents.Actor.create({ name: NAME, type: 'npc' });
      const scene = await foundry.documents.Scene.create({ name: NAME });
      const [token] = await scene.createEmbeddedDocuments('Token', [{ name: NAME, actorId: actor.id, actorLink: true }]);
      // "Post prompt to chat" on an inline check stores the enriched link.
      const link = await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@Check[reflex|dc:${DC}]`);
      const prompt = await foundry.documents.ChatMessage.create({ content: link });
      return { actor: actor.id, scene: scene.id, token: token.id, prompt: prompt.id };
    },
    { NAME, DC },
  );

  // The GM's sidebar may open on another tab, which hides the search input.
  await gmPage.evaluate((id) => {
    const api = game.modules.get(id).api;
    api.search.reset();
    api.focus();
  }, MODULE_ID);
});

test.afterEach(async ({ gmPage }) => {
  await reset(gmPage);
  if (!seeded) return;
  await gmPage.evaluate(
    async ({ seeded, extra, NAME }) => {
      const rolled = game.messages.filter((m: { speaker: { actor: string }; alias: string }) => m.speaker.actor === seeded.actor || m.alias === NAME);
      const ids = new Set([seeded.prompt, ...extra, ...rolled.map((m: { id: string }) => m.id)]);
      await foundry.documents.ChatMessage.deleteDocuments([...ids].filter((id) => game.messages.has(id)));
      await foundry.documents.Scene.deleteDocuments([seeded.scene]);
      await foundry.documents.Actor.deleteDocuments([seeded.actor]);
    },
    { seeded, extra, NAME },
  );
  extra.length = 0;
  seeded = undefined;
});

// PF2e names the roller's token on the roll, as it does when a player clicks the prompt.
const rollSave = (page: Page, dc: number) =>
  page.evaluate(
    async ({ seeded, dc }) => {
      const token = game.scenes.get(seeded.scene).tokens.get(seeded.token);
      await game.actors.get(seeded.actor).saves.reflex.roll({ dc: { value: dc }, skipDialog: true, token });
    },
    { seeded: seeded!, dc },
  );

test('typing reflex offers the prompt card, and the awaiting filter until the save is rolled', async ({ gmPage }) => {
  await pick(gmPage, 'reflex', 'awaiting', 'reflex');
  await expect(result(gmPage, seeded!.prompt)).toBeVisible();

  await rollSave(gmPage, DC);
  await expect(result(gmPage, seeded!.prompt)).toHaveCount(0);

  await reset(gmPage);
  await pick(gmPage, 'reflex', 'prompt', 'reflex');
  await expect(result(gmPage, seeded!.prompt)).toBeVisible();
});

test('a save against another DC leaves the prompt waiting', async ({ gmPage }) => {
  await rollSave(gmPage, DC + 1);
  await expect.poll(() => gmPage.evaluate((actor) => game.messages.filter((m: { speaker: { actor: string } }) => m.speaker.actor === actor).length, seeded!.actor)).toBe(1);
  await pick(gmPage, 'reflex', 'awaiting', 'reflex');
  await expect(result(gmPage, seeded!.prompt)).toBeVisible();
});

test('a failed recovery check ends the wait and leaves the button', async ({ gmPage }) => {
  const burning = await gmPage.evaluate(async (actor) => {
    const source = game.pf2e.ConditionManager.getCondition('persistent-damage').toObject();
    // A flat check cannot reach DC 31, so the condition and its button survive the roll.
    source.system.persistent = { formula: '1d4', damageType: 'fire', dc: 31 };
    await game.actors.get(actor).createEmbeddedDocuments('Item', [source]);
    await game.actors.get(actor).getCondition('persistent-damage-fire').onEndTurn();
    return game.messages.contents.at(-1).id;
  }, seeded!.actor);
  extra.push(burning);

  await pick(gmPage, 'recovery', 'awaiting', 'pd-recovery');
  await expect(result(gmPage, burning).locator(RECOVER)).toBeVisible();

  await gmPage.evaluate((actor) => game.actors.get(actor).getCondition('persistent-damage-fire').rollRecovery(), seeded!.actor);
  await expect(result(gmPage, burning)).toHaveCount(0);

  await reset(gmPage);
  await pick(gmPage, 'recovery', 'button', 'recovery-check');
  await expect(result(gmPage, burning).locator(RECOVER)).toBeVisible();
});

test.describe('with pf2e-toolbelt', () => {
  let damage: string;

  test.beforeEach(async ({ gmPage }) => {
    const active = await gmPage.evaluate(() => !!game.modules.get('pf2e-toolbelt')?.active);
    test.skip(!active, "Reads pf2e-toolbelt's target rows");

    damage = await gmPage.evaluate(
      async ({ NAME, DC, seeded }) => {
        const DamageRoll = CONFIG.Dice.rolls.find((roll: { name: string }) => roll.name === 'DamageRoll');
        const message = await new DamageRoll('2d6[fire]').toMessage({ flavor: `${NAME} blast` });
        // The flag toolbelt writes on a damage card whose spell allows a basic save.
        await message.setFlag('pf2e-toolbelt', 'targetHelper', {
          type: 'damage',
          isRegen: false,
          area: null,
          saveVariants: { null: { basic: true, dc: DC, saves: {}, statistic: 'reflex' } },
          targets: [`Scene.${seeded.scene}.Token.${seeded.token}`],
          applied: {},
          author: null,
          expended: 0,
          item: null,
          options: [],
          private: false,
          splashIndex: -1,
          traits: [],
          splashTargets: [],
        });
        return message.id;
      },
      { NAME, DC, seeded: seeded! },
    );
    extra.push(damage);
  });

  test("a damage card waits while toolbelt's row shows an unrolled save", async ({ gmPage }) => {
    await pick(gmPage, 'reflex', 'awaiting', 'reflex');
    await expect(result(gmPage, damage).locator('.target-row [data-action="roll-save"]')).toHaveCount(1);
    await expect.poll(() => facetsOf(gmPage, damage)).toMatchObject({ 'pf2e.prompt': ['reflex'], 'pf2e.awaiting': ['reflex'] });
  });

  test("a save rolled from toolbelt's row ends the wait", async ({ gmPage }) => {
    await pick(gmPage, 'reflex', 'awaiting', 'reflex');
    // Shift inverts the user's roll dialog setting; the test wants no dialog.
    const dialogs = await gmPage.evaluate(() => game.user.settings.showCheckDialogs);
    await result(gmPage, damage).locator('.target-row [data-action="roll-save"]').click({ modifiers: dialogs ? ['Shift'] : [] });
    await expect(result(gmPage, damage)).toHaveCount(0);
    expect((await facetsOf(gmPage, damage))?.['pf2e.prompt']).toEqual(['reflex']);
  });

  test('a save rolled in chat by the target ends the wait', async ({ gmPage }) => {
    await expect.poll(() => facetsOf(gmPage, damage)).toMatchObject({ 'pf2e.awaiting': ['reflex'] });
    await rollSave(gmPage, DC);
    await expect.poll(async () => (await facetsOf(gmPage, damage))?.['pf2e.awaiting']).toBeUndefined();
    expect((await facetsOf(gmPage, damage))?.['pf2e.prompt']).toEqual(['reflex']);
  });

  test('deleting the target token ends the wait and the prompt', async ({ gmPage }) => {
    await expect.poll(() => facetsOf(gmPage, damage)).toMatchObject({ 'pf2e.awaiting': ['reflex'] });
    await gmPage.evaluate(({ scene, token }) => game.scenes.get(scene).deleteEmbeddedDocuments('Token', [token]), seeded!);
    await expect.poll(async () => Object.keys((await facetsOf(gmPage, damage)) ?? {})).not.toContain('pf2e.prompt');
    expect((await facetsOf(gmPage, damage))?.['pf2e.awaiting']).toBeUndefined();
  });
});

test.describe('as a player', () => {
  let playerId: string;
  let playerContext: BrowserContext;
  let playerPage: Page;

  test.beforeEach(async ({ gmPage, browser }) => {
    playerId = await gmPage.evaluate(async () => {
      const name = `__e2e_player_${foundry.utils.randomID(6)}`;
      return (await foundry.documents.User.create({ name, role: CONST.USER_ROLES.PLAYER })).id;
    });
    playerContext = await newFoundryContext(browser);
    playerPage = await playerContext.newPage();
    await joinAs(playerPage, playerId);
    await waitForModuleActive(playerPage);
  });

  test.afterEach(async ({ gmPage }) => {
    await playerContext?.close();
    await gmPage.evaluate((id) => foundry.documents.User.deleteDocuments([id]), playerId);
  });

  test('the prompt filter is there and the awaiting filter is the GM’s alone', async ({ gmPage }) => {
    await expect.poll(() => facetsOf(playerPage, seeded!.prompt)).toMatchObject({ 'pf2e.prompt': ['reflex'] });
    expect((await facetsOf(playerPage, seeded!.prompt))?.['pf2e.awaiting']).toBeUndefined();
    await expect.poll(() => facetsOf(gmPage, seeded!.prompt)).toMatchObject({ 'pf2e.awaiting': ['reflex'] });
  });
});
