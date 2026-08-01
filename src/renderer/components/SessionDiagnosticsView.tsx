/**
 * @file 会话诊断工作区
 * @description 在同一挂载树中切换诊断列表和详情，并保留筛选与列表滚动位置。
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { SessionDiagnosisSummary } from '../../shared/costOptimizationTypes';
import type { SessionDiagnosisDetailModel } from '../utils/sessionDiagnosisDetailState';
import {
  DEFAULT_DIAGNOSIS_FILTERS,
  type SessionDiagnosisFilters,
} from '../utils/sessionDiagnosisFilters';
import SessionDiagnosisDetail from './SessionDiagnosisDetail';
import SessionDiagnosisList from './SessionDiagnosisList';

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface SessionDiagnosticsViewProps {
  summaries: SessionDiagnosisSummary[];
  diagnosisId: string | null;
  diagnosisDetailModel: SessionDiagnosisDetailModel;
  onDiagnosisOpen: (summary: SessionDiagnosisSummary) => void;
  onDiagnosisClose: () => void;
}

const renderDiagnosisDetailState = (
  model: SessionDiagnosisDetailModel,
  onBack: () => void,
  t: TFunction<'costOptimization'>
): React.ReactNode => {
  switch (model.kind) {
    case 'idle':
      return null;
    case 'loading':
      return <p role="status">{t('diagnostics.detail.loading')}</p>;
    case 'error':
      return (
        <section className="session-diagnosis-workspace-state" role="alert">
          <h3>{t('diagnostics.detail.unavailable')}</h3>
          <p>{model.message}</p>
          <button type="button" onClick={onBack}>
            {t('diagnostics.detail.back')}
          </button>
        </section>
      );
    case 'not-found':
      return (
        <section className="session-diagnosis-workspace-state">
          <h3>{t('diagnostics.detail.notFound')}</h3>
          <button type="button" onClick={onBack}>
            {t('diagnostics.detail.back')}
          </button>
        </section>
      );
    case 'ready':
      return (
        <>
          {model.isRefreshing ? (
            <p className="session-diagnosis-workspace-status" role="status">
              {t('diagnostics.detail.loading')}
            </p>
          ) : null}
          {model.staleReason ? (
            <p className="session-diagnosis-workspace-status" role="status">
              {t('diagnostics.detail.stale', { reason: model.staleReason })}
            </p>
          ) : null}
          <SessionDiagnosisDetail detail={model.detail} onBack={onBack} />
        </>
      );
  }
};

const SessionDiagnosticsView: React.FC<SessionDiagnosticsViewProps> = ({
  summaries,
  diagnosisId,
  diagnosisDetailModel,
  onDiagnosisOpen,
  onDiagnosisClose,
}) => {
  const { t } = useTranslation('costOptimization');
  const [filters, setFilters] = useState<SessionDiagnosisFilters>(DEFAULT_DIAGNOSIS_FILTERS);
  const [disappearedDiagnosisId, setDisappearedDiagnosisId] = useState<string | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const listScrollTopRef = useRef(0);

  const handleDiagnosisOpen = (summary: SessionDiagnosisSummary): void => {
    listScrollTopRef.current = listContainerRef.current?.scrollTop ?? 0;
    setDisappearedDiagnosisId(null);
    onDiagnosisOpen(summary);
  };

  useBrowserLayoutEffect(() => {
    if (diagnosisId === null && listContainerRef.current) {
      listContainerRef.current.scrollTop = listScrollTopRef.current;
    }
  }, [diagnosisId]);

  useEffect(() => {
    if (diagnosisDetailModel.kind !== 'not-found') {
      return;
    }

    setDisappearedDiagnosisId(diagnosisDetailModel.diagnosisId);
    onDiagnosisClose();
  }, [diagnosisDetailModel, onDiagnosisClose]);

  return (
    <div className="session-diagnosis-workspace">
      <div
        ref={listContainerRef}
        className="session-diagnosis-workspace-list"
        data-diagnosis-view="list"
        hidden={diagnosisId !== null}
        tabIndex={0}
        aria-label={t('diagnostics.list.title')}
      >
        {disappearedDiagnosisId ? (
          <p className="session-diagnosis-workspace-status" role="status">
            {t('diagnostics.detail.notFound')}
          </p>
        ) : null}
        <SessionDiagnosisList
          summaries={summaries}
          filters={filters}
          onFiltersChange={setFilters}
          onOpen={handleDiagnosisOpen}
        />
      </div>
      <div data-diagnosis-view="detail" hidden={diagnosisId === null}>
        {renderDiagnosisDetailState(diagnosisDetailModel, onDiagnosisClose, t)}
      </div>
    </div>
  );
};

export default SessionDiagnosticsView;
