import { untrack } from 'svelte';
import { MODULE_ID } from '@/constants';
import { search } from '@/search/state.svelte';
import type { MessageRecord } from '@/search/types';

const PAGE = 50;
const ACTIVE = `${MODULE_ID}-active`;

interface Rendered {
  record: MessageRecord;
  element: HTMLElement;
}

/**
 * Shows the matching messages in place of the chat log while a search is active. The panel
 * sits after the core log so ChatLog's own `querySelector` lookups (new posts, updates,
 * deletes) find its elements first.
 */
export class FilteredLog {
  readonly panel: HTMLElement;
  #list: HTMLOListElement;
  #more: HTMLButtonElement;
  #empty: HTMLElement;
  #rendered = new Map<string, Rendered>();
  #limit = PAGE;
  #pinToBottom = true;
  #generation = 0;
  #destroy: () => void;
  #scheduleRender = foundry.utils.debounce(() => void this.#render(search.active, search.results, 'bottom'), 120);

  constructor(private chat: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.className = `chat-scroll ${MODULE_ID}-results`;

    this.#more = document.createElement('button');
    this.#more.type = 'button';
    this.#more.className = `${MODULE_ID}-more`;
    this.#more.textContent = game.i18n?.localize(`${MODULE_ID}.more`) ?? 'Show older';
    this.#more.addEventListener('click', () => this.#showMore());

    this.#list = document.createElement('ol');
    this.#list.className = 'chat-log plain themed theme-light';

    this.#empty = document.createElement('p');
    this.#empty.className = `${MODULE_ID}-empty`;
    this.#empty.textContent = game.i18n?.localize(`${MODULE_ID}.empty`) ?? '';

    this.panel.append(this.#more, this.#list, this.#empty);

    this.#destroy = $effect.root(() => {
      $effect(() => {
        void search.queryKey;
        untrack(() => {
          this.#limit = PAGE;
          this.#pinToBottom = true;
        });
      });
      $effect(() => {
        void search.results;
        this.chat.classList.toggle(ACTIVE, search.active);
        this.#scheduleRender();
      });
    });
  }

  destroy(): void {
    this.#destroy();
    this.panel.remove();
    this.chat.classList.remove(ACTIVE);
  }

  async #showMore(): Promise<void> {
    this.#limit += PAGE;
    await this.#render(search.active, search.results, 'keep');
  }

  async #render(active: boolean, results: readonly MessageRecord[], scroll: 'bottom' | 'keep'): Promise<void> {
    const generation = ++this.#generation;
    if (!active) {
      this.#list.replaceChildren();
      this.#rendered.clear();
      return;
    }

    const wasAtBottom = this.panel.scrollHeight - this.panel.scrollTop - this.panel.clientHeight < 8;
    const fromBottom = this.panel.scrollHeight - this.panel.scrollTop;

    const page = results.slice(0, this.#limit).reverse();
    const entries = await Promise.all(page.map((record) => this.#element(record)));
    if (generation !== this.#generation) return;

    this.#rendered = new Map(entries.filter((e) => e !== null).map((e) => [e.record.id, e]));
    this.#list.replaceChildren(...[...this.#rendered.values()].map((e) => e.element));
    this.#more.hidden = results.length <= this.#limit;
    this.#empty.hidden = results.length > 0;

    if (scroll === 'keep') this.panel.scrollTop = this.panel.scrollHeight - fromBottom;
    else if (wasAtBottom || this.#pinToBottom) this.panel.scrollTop = this.panel.scrollHeight;
    this.#pinToBottom = false;
  }

  // A record is rebuilt whenever its message changes, so identity tells us when to re-render.
  async #element(record: MessageRecord): Promise<Rendered | null> {
    const cached = this.#rendered.get(record.id);
    if (cached?.record === record) return cached;
    const message = game.messages?.get(record.id);
    if (!message) return null;
    try {
      const ChatLog = foundry.applications.sidebar.tabs.ChatLog;
      return { record, element: await ChatLog.renderMessage(message) };
    } catch (err) {
      console.error(`${MODULE_ID} | failed to render message ${record.id}`, err);
      return null;
    }
  }
}
