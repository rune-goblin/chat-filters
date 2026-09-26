import './styles.css';
import { MODULE_ID } from './constants';
import { addChatButton } from './ui/chat-button';
import { ChatSearchApp } from './ui/ChatSearchApp';

interface ModuleApi {
  version: string;
  open: () => ChatSearchApp | null;
}

function open(): ChatSearchApp | null {
  if (!game.ready || !game.user.isGM) return null;
  return ChatSearchApp.open();
}

Hooks.once('init', () => {
  const { CONTROL, SHIFT } = foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS;
  game.keybindings?.register(MODULE_ID, 'open', {
    name: `${MODULE_ID}.keybinding`,
    editable: [{ key: 'KeyF', modifiers: [CONTROL, SHIFT] }],
    restricted: true,
    onDown: () => {
      open();
      return true;
    },
  });
});

Hooks.on('renderChatLog', (_app, html) => {
  if (game.ready && game.user.isGM) addChatButton(html as HTMLElement);
});

Hooks.once('ready', () => {
  const module = game.modules?.get(MODULE_ID);
  const version = module?.version ?? '0.0.0';
  const api: ModuleApi = { version, open };
  // `api` is the Foundry convention for a public API, but isn't a typed field on Module.
  if (module) (module as { api?: ModuleApi }).api = api;
  if (game.ready && game.user.isGM && ui.chat?.element) addChatButton(ui.chat.element);
});
