import { MODULE_ID } from '@/constants';
import { ChatSearchApp } from './ChatSearchApp';

/**
 * Adds a search button beside Export and Clear. Those controls exist only for GMs, and
 * ChatLog moves #chat-controls out of its own element when notifications show, so look in both.
 */
export function addChatButton(html: HTMLElement): void {
  const bars = new Set([
    ...html.querySelectorAll<HTMLElement>('.control-buttons'),
    ...document.querySelectorAll<HTMLElement>('#chat-controls .control-buttons'),
  ]);
  for (const bar of bars) {
    if (bar.querySelector(`.${MODULE_ID}-open`)) continue;
    const label = game.i18n?.localize(`${MODULE_ID}.open`) ?? 'Search chat';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ui-control icon fa-solid fa-magnifying-glass ${MODULE_ID}-open`;
    button.dataset.tooltip = '';
    button.ariaLabel = label;
    button.addEventListener('click', () => ChatSearchApp.open());
    bar.prepend(button);
  }
}
