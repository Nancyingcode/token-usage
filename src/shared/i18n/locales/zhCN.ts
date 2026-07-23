/**
 * @file 简体中文翻译资源
 * @description 提供与英文基准资源键结构一致的简体中文文案。
 */

import { en, type TranslationShape } from './en';

export const zhCN = {
  common: {
    app: {
      title: 'Codex Token 用量',
      daemon: '守护进程',
    },
    navigation: {
      label: '主导航',
      overview: '概览',
      budgets: '预算',
      sessions: '会话',
      tools: '工具',
      performance: '性能',
      wrapped: '设置',
    },
    toolbar: {
      dateRange: '日期范围',
      today: '今天',
      week: '近 7 天',
      month: '近 30 天',
      refresh: '刷新',
      language: '语言',
      languageChangeFailed: '无法保存语言偏好。',
    },
    action: {
      cancel: '取消',
      close: '关闭',
      delete: '删除',
      save: '保存',
      saving: '正在保存',
    },
    item: {
      sessions_one: '{{count}} 个会话',
      sessions_other: '{{count}} 个会话',
      projects_one: '{{count}} 个项目',
      projects_other: '{{count}} 个项目',
      warnings_one: '{{count}} 个警告',
      warnings_other: '{{count}} 个警告',
    },
    value: {
      ok: '正常',
      unknownDate: '未知日期',
      unknownModel: '未知模型',
      notSet: '未设置',
    },
  },
} satisfies TranslationShape<typeof en>;
