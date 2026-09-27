import { mount } from 'svelte';
import { MODULE_ID } from '@/constants';
import { FilteredLog } from './filtered-log.svelte';
import SearchBar from './SearchBar.svelte';

let filteredLog: FilteredLog | undefined;

/** Adds the search bar above the sidebar chat log and the results panel after it. Idempotent. */
export function attachToChat(chat: HTMLElement): void {
  const log = chat.querySelector<HTMLElement>(`.chat-scroll:not(.${MODULE_ID}-results)`);
  if (!log) return;

  if (!chat.querySelector(`.${MODULE_ID}-bar`)) {
    const host = document.createElement('div');
    host.className = `${MODULE_ID}-bar`;
    log.before(host);
    mount(SearchBar, { target: host });
  }

  if (!filteredLog?.panel.isConnected || !chat.contains(filteredLog.panel)) {
    filteredLog?.destroy();
    filteredLog = new FilteredLog(chat);
  }
  log.after(filteredLog.panel);
}

export function focusSearch(): void {
  ui.sidebar?.expand();
  ui.chat?.activate();
  ui.chat?.element?.querySelector<HTMLInputElement>(`.${MODULE_ID}-input`)?.focus();
}
