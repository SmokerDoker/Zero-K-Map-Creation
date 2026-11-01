import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  translate,
  type Language,
  type MessageKey,
  type MessageParams
} from '../../shared/i18n'

const STORAGE_KEY = 'zkmc.language'

function readStoredLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isLanguage(stored)) return stored
  } catch {
    // storage unavailable — fall through to the default
  }
  return DEFAULT_LANGUAGE
}

export type TranslateFn = (key: MessageKey, params?: MessageParams) => string

interface I18nContextValue {
  lang: Language
  setLang: (lang: Language) => void
  t: TranslateFn
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [lang, setLangState] = useState<Language>(readStoredLanguage)

  useEffect(() => {
    document.documentElement.lang = lang
    // The main process needs the language too, for native dialogs and error messages.
    void window.api.setLanguage(lang)
  }, [lang])

  const setLang = useCallback((next: Language) => {
    setLangState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // not persisted — the choice still applies for this session
    }
  }, [])

  const t = useCallback<TranslateFn>((key, params) => translate(lang, key, params), [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
