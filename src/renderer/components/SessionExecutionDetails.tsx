/**
 * @file 会话思考强度与线程速度
 * @description 展示按回合归属的用量和线程设置记录，线程设置无法证明某次请求使用的服务档位。
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../shared/i18n/locale';
import type { ThreadSpeedChange, UsageSession } from '../../shared/usageTypes';
import { formatNumber, formatShortDateTime } from '../utils/formatters';

interface SessionExecutionDetailsProps extends Pick<
  UsageSession,
  'reasoningEfforts' | 'speedHistory'
> {
  locale: SupportedLocale;
}

interface SpeedHistoryProps {
  changes: ThreadSpeedChange[];
  locale: SupportedLocale;
  speedLabel: (tier: string | null) => string;
}

const SpeedHistory = ({ changes, locale, speedLabel }: SpeedHistoryProps) => {
  const { t } = useTranslation('analytics', { keyPrefix: 'sessions.execution' });
  const [open, setOpen] = useState(false);
  // 同一时间可能记录多次切换，旧记录也可能缺少时间，按同一时间的出现顺序标识每次变化。
  const occurrencesByTime = new Map<string | null, number>();
  return (
    <details
      className="session-speed-history"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{t('speedHistory')}</summary>
      {open ? (
        <ol>
          {changes.map(({ serviceTier, occurredAt }) => {
            const occurrence = (occurrencesByTime.get(occurredAt) ?? 0) + 1;
            occurrencesByTime.set(occurredAt, occurrence);
            return (
              <li key={`${occurredAt ?? ''}/${occurrence}`}>
                <span>{speedLabel(serviceTier)}</span>
                {occurredAt ? (
                  <time dateTime={occurredAt}>
                    {formatShortDateTime(occurredAt, locale, t('timeNotRecorded'))}
                  </time>
                ) : (
                  <span>{t('timeNotRecorded')}</span>
                )}
              </li>
            );
          })}
        </ol>
      ) : null}
    </details>
  );
};

const SessionExecutionDetails = ({
  reasoningEfforts = [],
  speedHistory = [],
  locale,
}: SessionExecutionDetailsProps) => {
  const { t } = useTranslation('analytics', { keyPrefix: 'sessions.execution' });
  const missing = t('notRecorded');
  const tokenCount = (count: number | null) =>
    count === null ? missing : formatNumber(count, locale);
  const speedLabel = (tier: string | null | undefined) => {
    if (tier === 'default') return t('standard');
    if (tier === 'priority' || tier === 'fast') return t('fast');
    if (tier === 'ultrafast') return t('ultrafast');
    return tier || missing;
  };
  const latestSpeed = speedHistory.at(-1)?.serviceTier;

  return (
    <div className="session-execution-details">
      {reasoningEfforts.length > 0 ? (
        <table className="session-effort-table">
          <caption>{t('reasoningEffort')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('effort')}</th>
              <th scope="col">{t('turns')}</th>
              <th scope="col">{t('totalTokens')}</th>
              <th scope="col">{t('reasoningTokens')}</th>
            </tr>
          </thead>
          <tbody>
            {reasoningEfforts.map(({ effort, turnCount, totalTokens, reasoningOutputTokens }) => (
              <tr key={effort ?? ''}>
                <th scope="row">{effort ?? t('unknown')}</th>
                <td>{formatNumber(turnCount, locale)}</td>
                <td>{tokenCount(totalTokens)}</td>
                <td>{tokenCount(reasoningOutputTokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <dl>
          <dt>{t('reasoningEffort')}</dt>
          <dd>{missing}</dd>
        </dl>
      )}
      <div>
        <dl>
          <dt>{t('latestSpeed')}</dt>
          <dd>{speedLabel(latestSpeed)}</dd>
          <dt>{t('actualTier')}</dt>
          <dd>{missing}</dd>
        </dl>
        {speedHistory.length > 1 ? (
          <SpeedHistory changes={speedHistory} locale={locale} speedLabel={speedLabel} />
        ) : null}
      </div>
    </div>
  );
};

export default SessionExecutionDetails;
