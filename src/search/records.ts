import { MODULE_ID } from '@/constants';
import { htmlToText } from './text';
import type { FacetDef, MessageRecord, RecordView, Visibility } from './types';

export function visibilityOf(message: ChatMessage): Visibility {
  if (message.blind) return 'blind';
  return message.whisper.length ? 'whisper' : 'public';
}

export function coreFacets(speaker: (message: ChatMessage) => string): FacetDef[] {
  return [
    {
      key: 'author',
      label: `${MODULE_ID}.facet.author`,
      values: (m) => (m.author?.name ? [m.author.name] : []),
      header: true,
    },
    {
      key: 'speaker',
      label: `${MODULE_ID}.facet.speaker`,
      values: (m) => {
        const name = speaker(m);
        return name ? [name] : [];
      },
      header: true,
    },
    {
      key: 'visibility',
      label: `${MODULE_ID}.facet.visibility`,
      values: (m) => [visibilityOf(m)],
      valueLabel: (v) => game.i18n?.localize(`${MODULE_ID}.visibility.${v}`) ?? v,
      header: true,
    },
    {
      key: 'kind',
      label: `${MODULE_ID}.facet.kind`,
      values: (m) => [m.isRoll ? 'roll' : 'message'],
      valueLabel: (v) => game.i18n?.localize(`${MODULE_ID}.kind.${v}`) ?? v,
    },
  ];
}

function visibleText(html: string | null | undefined, message: ChatMessage, view: RecordView): string {
  if (!html || !view.redact) return htmlToText(html);
  // A <template> parses without running scripts or loading images.
  const template = document.createElement('template');
  template.innerHTML = html;
  view.redact(template.content, message);
  return htmlToText(template.innerHTML);
}

/**
 * Indexes only what the current user's card shows. A blind roll shows its author only the
 * header, so its record carries the header facets and nothing from the content or rolls.
 */
export function buildRecord(message: ChatMessage, view: RecordView): MessageRecord {
  const hidden = !message.isContentVisible;
  const speaker = view.speaker(message);
  const flavor = hidden ? '' : visibleText(message.flavor, message, view);
  const content = hidden ? '' : visibleText(message.content, message, view);
  const rolls = hidden ? '' : message.rolls.map((roll) => `${roll.formula} = ${roll.total ?? ''}`).join(' · ');

  const record: MessageRecord = {
    id: message.id!,
    timestamp: message.timestamp ?? 0,
    speaker,
    haystack: [speaker, flavor, content, rolls].join(' ').toLowerCase(),
    preview: [flavor, content].filter(Boolean).join(' — ') || rolls,
    facets: {},
  };

  for (const facet of view.facets) {
    if (hidden && !facet.header) continue;
    try {
      const values = facet.values(message);
      if (values.length) record.facets[facet.key] = values;
    } catch (err) {
      console.warn(`${MODULE_ID} | facet "${facet.key}" failed on message ${message.id}`, err);
    }
  }
  return record;
}
