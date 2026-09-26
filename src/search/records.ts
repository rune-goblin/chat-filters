import { MODULE_ID } from '@/constants';
import { htmlToText } from './text';
import type { FacetDef, MessageRecord, Visibility } from './types';

export function visibilityOf(message: ChatMessage): Visibility {
  if (message.blind) return 'blind';
  return message.whisper.length ? 'whisper' : 'public';
}

export const CORE_FACETS: FacetDef[] = [
  {
    key: 'author',
    label: `${MODULE_ID}.facet.author`,
    values: (m) => (m.author?.name ? [m.author.name] : []),
  },
  {
    key: 'speaker',
    label: `${MODULE_ID}.facet.speaker`,
    values: (m) => (m.alias ? [m.alias] : []),
  },
  {
    key: 'visibility',
    label: `${MODULE_ID}.facet.visibility`,
    values: (m) => [visibilityOf(m)],
    valueLabel: (v) => game.i18n?.localize(`${MODULE_ID}.visibility.${v}`) ?? v,
  },
  {
    key: 'kind',
    label: `${MODULE_ID}.facet.kind`,
    values: (m) => [m.isRoll ? 'roll' : 'message'],
    valueLabel: (v) => game.i18n?.localize(`${MODULE_ID}.kind.${v}`) ?? v,
  },
];

export function buildRecord(message: ChatMessage, facets: readonly FacetDef[]): MessageRecord {
  const flavor = htmlToText(message.flavor);
  const content = htmlToText(message.content);
  const rolls = message.rolls.map((roll) => `${roll.formula} = ${roll.total ?? ''}`).join(' · ');
  const speaker = message.alias;

  const record: MessageRecord = {
    id: message.id!,
    timestamp: message.timestamp ?? 0,
    speaker,
    haystack: [speaker, flavor, content, rolls].join(' ').toLowerCase(),
    preview: [flavor, content].filter(Boolean).join(' — ') || rolls,
    facets: {},
  };

  for (const facet of facets) {
    try {
      const values = facet.values(message);
      if (values.length) record.facets[facet.key] = values;
    } catch (err) {
      console.warn(`${MODULE_ID} | facet "${facet.key}" failed on message ${message.id}`, err);
    }
  }
  return record;
}
