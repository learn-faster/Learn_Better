export const I18N_LANGUAGE_CHANGE_START = 'i18n:language-change-start'
export const I18N_LANGUAGE_CHANGE_END = 'i18n:language-change-end'

export const i18nEvents = new EventTarget()

export function emitLanguageChangeStart(language) {
  i18nEvents.dispatchEvent(
    new CustomEvent(I18N_LANGUAGE_CHANGE_START, {
      detail: { language },
    })
  )
}

export function emitLanguageChangeEnd(language) {
  i18nEvents.dispatchEvent(
    new CustomEvent(I18N_LANGUAGE_CHANGE_END, {
      detail: { language },
    })
  )
}
