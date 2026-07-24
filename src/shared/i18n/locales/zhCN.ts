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
      budgetPolicies_one: '已配置 {{count}} 条预算策略。',
      budgetPolicies_other: '已配置 {{count}} 条预算策略。',
    },
    value: {
      ok: '正常',
      unknownDate: '未知日期',
      unknownModel: '未知模型',
      notSet: '未设置',
    },
    state: {
      scanFailed: '扫描失败',
      scanningTitle: '正在扫描本地 Codex 会话',
      scanningDescription: '仅以只读方式解析 JSONL，不修改或上传任何数据。',
      noSessions: '未找到 Codex 会话',
      scannedPath: '扫描路径：{{path}}',
      periodEmptyTitle: '此时间范围内没有会话',
      periodEmptyDescription: '{{period}}没有启动过 Codex 会话。',
      period: {
        today: '今天',
        week: '最近 7 天',
        month: '最近 30 天',
      },
      budgetLoadingTitle: '正在加载预算中心',
      budgetLoadingDescription: '正在读取本地预算策略和模型价格。',
      budgetUnavailable: '预算中心不可用',
      budgetCenter: '预算中心',
    },
  },
  notifications: {
    title: 'Token 预算提醒',
    metric: {
      token: 'Token',
      cost: '费用',
    },
    reached: '{{metric}} 预算已达到 {{thresholdPercent}}%。',
  },
  settings: {
    dataPath: '数据路径',
    codexSessions: 'Codex 会话',
    privacy: '隐私',
    localReadOnly: '本地只读',
    privacyDescription: '应用仅读取本地 JSONL 文件，不会修改 Codex 数据或上传用量。',
    costEstimate: '费用估算',
    modelBasedEstimate: '按模型估算',
    costDescription:
      '费用根据本地会话记录的模型和预算价格表估算。未知模型不会计价，估算结果不代表实际账单。',
    warnings: '警告',
    scanWarnings_one: '{{count}} 条扫描警告',
    scanWarnings_other: '{{count}} 条扫描警告',
    noWarnings: '未发现解析器警告。',
  },
  warnings: {
    'malformed-jsonl': '已跳过格式错误的 JSONL 行。',
    'invalid-jsonl-record': '已跳过无效的 JSONL 记录。',
    'invalid-token-usage': '已跳过无效的 Token 用量。',
    'session-file-unreadable': '无法读取会话文件：{{details}}',
    'sessions-directory-unreadable': '无法扫描 Codex 会话目录：{{details}}',
    'malformed-session-index': '已跳过格式错误的会话索引行。',
  },
} satisfies TranslationShape<typeof en>;
