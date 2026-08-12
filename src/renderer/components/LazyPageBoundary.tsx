/**
 * @file 懒加载页面边界
 * @description 为非首屏页面提供本地化加载状态，并在动态 chunk 失败时保留应用外壳。
 */
import React, { Suspense } from 'react';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ICON_SIZE_LARGE } from '../constants/ui';

interface LazyPageErrorBoundaryProps {
  children: React.ReactNode;
  title: string;
  actionLabel: string;
  onRetry: () => void;
}

interface LazyPageErrorBoundaryState {
  failed: boolean;
}

class LazyPageErrorBoundary extends React.Component<
  LazyPageErrorBoundaryProps,
  LazyPageErrorBoundaryState
> {
  public state: LazyPageErrorBoundaryState = { failed: false };

  public static getDerivedStateFromError(): LazyPageErrorBoundaryState {
    return { failed: true };
  }

  public render(): React.ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <section className="state-panel" role="alert">
        <AlertCircle aria-hidden="true" size={ICON_SIZE_LARGE} />
        <h2>{this.props.title}</h2>
        <button className="status-banner-action" type="button" onClick={this.props.onRetry}>
          {this.props.actionLabel}
        </button>
      </section>
    );
  }
}

interface LazyPageBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
}

const reloadApplication = (): void => globalThis.location.reload();

const LazyPageBoundary: React.FC<LazyPageBoundaryProps> = ({ children, fallback }) => {
  const { t } = useTranslation('common');

  return (
    <LazyPageErrorBoundary
      title={t('state.pageLoadFailed')}
      actionLabel={t('state.reloadApplication')}
      onRetry={reloadApplication}
    >
      <Suspense fallback={fallback}>{children}</Suspense>
    </LazyPageErrorBoundary>
  );
};

export default LazyPageBoundary;
