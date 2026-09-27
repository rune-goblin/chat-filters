import './styles.css';
import { tick } from 'svelte';
import { MODULE_ID } from './constants';
import { search } from './search/state.svelte';
import { attachToChat, focusSearch } from './ui/inline';
import { revealMessage } from './ui/reveal';

interface ModuleApi {
  version: string;
  focus: () => void;
  search: typeof search;
}

const isGM = () => game.ready && game.user.isGM;

Hooks.once('init', () => {
  const { CONTROL, SHIFT } = foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS;
  game.keybindings?.register(MODULE_ID, 'focus', {
    name: `${MODULE_ID}.keybinding`,
    editable: [{ key: 'KeyF', modifiers: [CONTROL, SHIFT] }],
    restricted: true,
    onDown: () => {
      focusSearch();
      return true;
    },
  });
});

Hooks.on('renderChatLog', (app, html) => {
  if (isGM() && !(app as { isPopout?: boolean }).isPopout) attachToChat(html as HTMLElement);
});

Hooks.on('getChatMessageContextOptions', (_app, options) => {
  if (!isGM()) return;
  options.push({
    name: `${MODULE_ID}.showInLog`,
    icon: 'fa-solid fa-arrows-to-eye',
    condition: (li: HTMLElement) => search.active && !!li.closest(`.${MODULE_ID}-results`),
    callback: async (li: HTMLElement) => {
      const id = li.dataset.messageId;
      search.reset();
      await tick();
      if (id && !(await revealMessage(id))) ui.notifications?.warn(`${MODULE_ID}.notFound`, { localize: true });
    },
  } as never);
});

Hooks.once('ready', () => {
  const module = game.modules?.get(MODULE_ID);
  const version = module?.version ?? '0.0.0';
  const api: ModuleApi = { version, focus: focusSearch, search };
  // `api` is the Foundry convention for a public API, but isn't a typed field on Module.
  if (module) (module as { api?: ModuleApi }).api = api;
  if (!isGM()) return;
  search.index.connect();
  if (ui.chat?.element) attachToChat(ui.chat.element);
});
