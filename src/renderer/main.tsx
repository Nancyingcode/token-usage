import React from 'react';
import ReactDOM from 'react-dom/client';
import type { i18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { DEFAULT_LOCALE } from '../shared/i18n/locale';
import App from './App';
import { createRendererI18n, resolveRendererLocale } from './i18n';
import './styles.css';

const syncDocumentLanguage = (instance: i18n): void => {
  const locale = resolveRendererLocale(instance.resolvedLanguage);
  document.documentElement.lang = locale;
  document.title = instance.t('common:app.title');
};

const startRenderer = async (): Promise<void> => {
  const i18n = await createRendererI18n(window.codexUsage.locale.initial);
  syncDocumentLanguage(i18n);

  window.codexUsage.locale.onUpdated((locale) => {
    void i18n
      .changeLanguage(locale)
      .then(() => syncDocumentLanguage(i18n))
      .catch(async () => {
        await i18n.changeLanguage(DEFAULT_LOCALE);
        syncDocumentLanguage(i18n);
      });
  });

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>
    </React.StrictMode>
  );
};

void startRenderer();
