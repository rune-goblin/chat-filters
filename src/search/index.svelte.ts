import { activeView } from '@/adapters';
import { buildRecord, isStale } from './records';
import type { FacetDef, MessageRecord, RecordView } from './types';

/** Live, newest-first index of the chat messages the current user can see. */
export class ChatIndex {
  // Resolved on connect: the active system is unknown when this module is first imported.
  facets = $state.raw<FacetDef[]>([]);
  records = $state.raw<MessageRecord[]>([]);
  #view: RecordView | undefined;

  #cache = new Map<string, MessageRecord>();
  #hooks: [string, number][] = [];
  #refresh = foundry.utils.debounce(() => this.#build(), 150);

  connect(): void {
    if (!game.ready) return;
    this.#view = activeView(game.user.isGM);
    this.facets = this.#view.facets;
    this.#build();
    const invalidate = (message: ChatMessage) => {
      this.#cache.delete(message.id!);
      this.#refresh();
    };
    const refresh = () => this.#refresh();
    this.#hooks = [
      ['createChatMessage', Hooks.on('createChatMessage', refresh)],
      ['updateChatMessage', Hooks.on('updateChatMessage', invalidate)],
      ['deleteChatMessage', Hooks.on('deleteChatMessage', invalidate)],
      ...(this.#view.refreshOn ?? []).map((hook): [string, number] => [hook, Hooks.on(hook as never, refresh as never)]),
    ];
  }

  disconnect(): void {
    for (const [hook, id] of this.#hooks) Hooks.off(hook as never, id);
    this.#hooks = [];
  }

  #build(): void {
    if (!game.ready || !this.#view) return;
    const view = this.#view;
    const next: MessageRecord[] = [];
    const live = new Map<string, MessageRecord>();
    const messages = game.messages.contents.filter((message) => message.visible);
    view.prepare?.(messages);
    for (const message of messages) {
      const cached = this.#cache.get(message.id!);
      const record = cached && !isStale(cached, message, view) ? cached : buildRecord(message, view);
      live.set(record.id, record);
      next.push(record);
    }
    this.#cache = live;
    this.records = next.reverse();
  }
}
