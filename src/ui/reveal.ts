const FLASH = 'chat-search-flash';

/**
 * Scrolls the sidebar chat log to a message and flashes it. The log renders messages in
 * batches from the bottom, so older ones need more batches rendered before they exist in the DOM.
 */
export async function revealMessage(messageId: string): Promise<boolean> {
  const chat = ui.chat;
  if (!chat?.element) return false;
  ui.sidebar?.expand();
  chat.activate();

  const log = () => chat.element!.querySelector('.chat-scroll')!;
  const find = () => log().querySelector<HTMLElement>(`.message[data-message-id="${messageId}"]`);

  let target = find();
  let stalls = 0;
  while (!target && stalls < 5) {
    const before = log().querySelectorAll('.message').length;
    await chat.renderBatch(CONFIG.ChatMessage.batchSize);
    target = find();
    const after = log().querySelectorAll('.message').length;
    if (after === before) {
      // renderBatch returns early while another batch (e.g. from the log's scroll handler) is in flight.
      stalls++;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } else stalls = 0;
  }
  if (!target) return false;

  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.remove(FLASH);
  void target.offsetWidth; // reflow so a repeat click restarts the animation
  target.classList.add(FLASH);
  target.addEventListener('animationend', () => target.classList.remove(FLASH), { once: true });
  return true;
}
