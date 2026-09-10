import { useTranslation } from 'react-i18next';
import { usePricingSync } from '../hooks/usePricingSync';
import { resolveRendererLocale } from '../i18n';
import { formatShortDateTime } from '../utils/formatters';

export const PricingSyncPanel = () => {
  const { t, i18n } = useTranslation('budgets');
  const { snapshot, pending, unavailable, refresh, setAutoUpdate } = usePricingSync();
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const disabled = !snapshot || pending || snapshot.status === 'refreshing';
  const status = unavailable
    ? t('pricing.sync.unavailable')
    : snapshot?.error
      ? t(`pricing.sync.errors.${snapshot.error}`)
      : t(`pricing.sync.states.${snapshot?.status ?? 'loading'}`);
  return (
    <section className="pricing-sync-card panel" aria-label={t('pricing.sync.title')}>
      <div>
        <h4>{t('pricing.sync.title')}</h4>
        <p>{t('pricing.sync.description')}</p>
      </div>
      <div className="pricing-sync-controls">
        <label>
          <input
            type="checkbox"
            checked={snapshot?.autoUpdate ?? false}
            disabled={disabled}
            onChange={(event) => void setAutoUpdate(event.target.checked)}
          />
          {t('pricing.sync.autoUpdate')}
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={disabled}
          onClick={() => void refresh()}
        >
          {t('pricing.sync.refresh')}
        </button>
      </div>
      <p role="status" aria-live="polite">
        {status}
      </p>
      <dl className="pricing-sync-metadata">
        <div>
          <dt>{t('pricing.sync.version')}</dt>
          <dd>{snapshot?.version ?? t('pricing.sync.builtIn')}</dd>
        </div>
        <div>
          <dt>{t('pricing.sync.checked')}</dt>
          <dd>
            {snapshot?.lastCheckedAt
              ? formatShortDateTime(snapshot.lastCheckedAt, locale, t('pricing.sync.never'))
              : t('pricing.sync.never')}
          </dd>
        </div>
        <div>
          <dt>{t('pricing.sync.source')}</dt>
          <dd>{snapshot?.sourceUrl ?? '—'}</dd>
        </div>
      </dl>
    </section>
  );
};
