import { activeFacets } from '@/adapters';
import { buildRecord } from './records';
import type { FacetDef, MessageRecord } from './types';

/** Live, newest-first index of the chat messages the current user can see. */
export class ChatIndex {
  readonly facets: FacetDef[] = activeFacets();
  records = $state.raw<MessageRecord[]>([]);

  #cache = new Map<string, MessageRecord>();
  #hooks: [string, number][] = [];
  #refresh = foundry.utils.debounce(() => this.#build(), 150);

  connect(): void {
    this.#build();
    const invalidate = (message: ChatMessage) => {
      this.#cache.delete(message.id!);
      this.#refresh();
    };
    this.#hooks = [
      ['createChatMessage', Hooks.on('createChatMessage', () => this.#refresh())],
      ['updateChatMessage', Hooks.on('updateChatMessage', invalidate)],
      ['deleteChatMessage', Hooks.on('deleteChatMessage', invalidate)],
    ];
  }

  disconnect(): void {
    for (const [hook, id] of this.#hooks) Hooks.off(hook as never, id);
    this.#hooks = [];
  }

  #build(): void {
    if (!game.ready) return;
    const next: MessageRecord[] = [];
    const live = new Map<string, MessageRecord>();
    for (const message of game.messages.contents) {
      if (!message.visible) continue;
      const record = this.#cache.get(message.id!) ?? buildRecord(message, this.facets);
      live.set(record.id, record);
      next.push(record);
    }
    this.#cache = live;
    this.records = next.reverse();
  }
}
