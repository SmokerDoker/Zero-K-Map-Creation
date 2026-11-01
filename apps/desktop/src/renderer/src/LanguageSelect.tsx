import { LANGUAGES, isLanguage } from '../../shared/i18n'
import { useI18n } from './i18n'

export function LanguageSelect(): JSX.Element {
  const { lang, setLang, t } = useI18n()
  return (
    <label className="language-select">
      <span>{t('app.language')}</span>
      <select
        value={lang}
        onChange={(e) => {
          if (isLanguage(e.target.value)) setLang(e.target.value)
        }}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  )
}
