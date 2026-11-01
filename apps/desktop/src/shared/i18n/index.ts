import { en, type MessageKey } from './en'
import { de } from './de'

export type { MessageKey }

export type Language = 'en' | 'de'

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' }
]

export const DEFAULT_LANGUAGE: Language = 'en'

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { en, de }

export type MessageParams = Record<string, string | number>

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'de'
}

/** Looks up `key` in the given language (falling back to English) and fills `{name}` placeholders. */
export function translate(lang: Language, key: MessageKey, params?: MessageParams): string {
  const template = DICTIONARIES[lang]?.[key] ?? en[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  )
}

/** A message that is translated where it is displayed rather than where it is produced. */
export interface LocalizedMessage {
  key: MessageKey
  params?: MessageParams
}
