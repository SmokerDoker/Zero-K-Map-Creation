import { DEFAULT_LANGUAGE, translate, type Language, type MessageKey, type MessageParams } from '../shared/i18n'

/** UI language last reported by the renderer; used for native dialogs and main-process errors. */
let currentLanguage: Language = DEFAULT_LANGUAGE

export function setMainLanguage(lang: Language): void {
  currentLanguage = lang
}

export function getMainLanguage(): Language {
  return currentLanguage
}

export function t(key: MessageKey, params?: MessageParams): string {
  return translate(currentLanguage, key, params)
}
