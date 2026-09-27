import { mount, unmount } from 'svelte';
import { MODULE_ID } from '@/constants';
import Filters from './Filters.svelte';

const { ApplicationV2 } = foundry.applications.api;

export class FiltersApp extends ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-filters`,
    tag: 'section',
    classes: [MODULE_ID],
    window: { title: `${MODULE_ID}.filters`, icon: 'fa-solid fa-filter', resizable: true },
    position: { width: 420, height: 'auto' as const },
  };

  static #instance?: FiltersApp;

  #component?: ReturnType<typeof mount>;
  #root?: HTMLElement;

  static toggle(): void {
    const app = (FiltersApp.#instance ??= new FiltersApp());
    if (app.rendered) void app.close();
    else void app.render({ force: true, position: FiltersApp.#besideChat() });
  }

  static #besideChat(): { left: number; top: number } | undefined {
    const chat = ui.chat?.element?.getBoundingClientRect();
    if (!chat?.width) return undefined;
    return { left: Math.max(0, chat.left - 430), top: Math.max(0, chat.top) };
  }

  // AppV2 runs _renderHTML on every render; mount once and reuse the node, so a
  // re-render neither leaks a second component nor discards Svelte's reactive state.
  protected override async _renderHTML(): Promise<HTMLElement> {
    if (!this.#component) {
      this.#root = document.createElement('div');
      this.#component = mount(Filters, { target: this.#root });
    }
    return this.#root!;
  }

  protected override _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  protected override async _preClose(): Promise<void> {
    if (this.#component) unmount(this.#component);
    this.#component = undefined;
    this.#root = undefined;
  }
}
