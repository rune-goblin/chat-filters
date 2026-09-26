import { mount, unmount } from 'svelte';
import { MODULE_ID } from '@/constants';
import { ChatIndex } from '@/search/index.svelte';
import ChatSearch from './ChatSearch.svelte';

const { ApplicationV2 } = foundry.applications.api;

export class ChatSearchApp extends ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-app`,
    tag: 'section',
    classes: [MODULE_ID],
    window: { title: `${MODULE_ID}.title`, icon: 'fa-solid fa-magnifying-glass', resizable: true },
    position: { width: 480, height: 640 },
  };

  static #instance?: ChatSearchApp;

  #component?: ReturnType<typeof mount>;
  #root?: HTMLElement;
  #index?: ChatIndex;

  static open(): ChatSearchApp {
    const app = (ChatSearchApp.#instance ??= new ChatSearchApp());
    if (app.rendered) app.bringToFront();
    else app.render({ force: true });
    return app;
  }

  // AppV2 runs _renderHTML on every render; mount once and reuse the node, so a
  // re-render neither leaks a second component nor discards Svelte's reactive state.
  protected override async _renderHTML(): Promise<HTMLElement> {
    if (!this.#component) {
      this.#index = new ChatIndex();
      this.#index.connect();
      this.#root = document.createElement('div');
      this.#root.className = `${MODULE_ID}-root`;
      this.#component = mount(ChatSearch, { target: this.#root, props: { index: this.#index } });
    }
    return this.#root!;
  }

  protected override _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  protected override async _preClose(): Promise<void> {
    this.#index?.disconnect();
    if (this.#component) unmount(this.#component);
    this.#component = undefined;
    this.#root = undefined;
    this.#index = undefined;
  }
}
