import { describe, expect, it } from 'vitest'
import { en } from '../en'
import { de } from '../de'
import { translate } from '..'

function placeholders(s: string): string[] {
  return (s.match(/\{\w+\}/g) ?? []).sort()
}

describe('i18n', () => {
  it('German uses the same placeholders as English for every key', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(de[key]), key).toEqual(placeholders(en[key]))
    }
  })

  it('fills placeholders', () => {
    expect(translate('en', 'metal.count', { count: 3 })).toBe('3 spot(s) in total')
    expect(translate('de', 'metal.count', { count: 3 })).toBe('3 Spot(s) insgesamt')
  })
})
