import en from './en.json';

const messages = { en };

function t(key) {
  const parts = key.split('.');
  let val = messages.en;
  for (const p of parts) {
    val = val?.[p];
    if (val === undefined) return key;
  }
  if (typeof val === 'string') return val;
  return key;
}

export function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const translated = t(el.dataset.i18n);
    if (translated && translated !== el.dataset.i18n) {
      if (el.tagName === 'INPUT' && el.type === 'text') {
        el.placeholder = translated;
      } else {
        el.textContent = translated;
      }
    }
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const translated = t(el.dataset.i18nTitle);
    if (translated) el.title = translated;
  });
}

applyTranslations();

export { t };
