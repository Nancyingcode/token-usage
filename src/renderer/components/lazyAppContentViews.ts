/**
 * @file 非首屏页面代码拆分
 * @description 保持应用外壳与概览在入口包中，其余页面仅在首次访问时加载。
 */
import React from 'react';
import type { AppContentViews } from './AppContent';

export const LAZY_APP_CONTENT_VIEWS: AppContentViews = {
  BudgetsView: React.lazy(() => import('./BudgetsView')),
  CostOptimizationView: React.lazy(() => import('./CostOptimizationView')),
  SessionsView: React.lazy(() => import('./SessionsView')),
  ProjectsView: React.lazy(() => import('./ProjectsView')),
  PerformanceView: React.lazy(() => import('./PerformanceView')),
  SettingsView: React.lazy(() => import('./SettingsView')),
};
