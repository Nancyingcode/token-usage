/**
 * @file English translation resources
 * @description Defines the canonical translation shape and English fallback copy.
 */

export type TranslationShape<Resource> = {
  [Key in keyof Resource]: Resource[Key] extends string ? string : TranslationShape<Resource[Key]>;
};

export const en = {
  common: {
    app: {
      title: 'Codex Token Usage',
      daemon: 'Daemon',
    },
    navigation: {
      label: 'Primary navigation',
      overview: 'Overview',
      budgets: 'Budgets',
      sessions: 'Sessions',
      tools: 'Tools',
      performance: 'Performance',
      wrapped: 'Wrapped',
    },
    toolbar: {
      dateRange: 'Date range',
      today: 'Today',
      week: 'Week',
      month: 'Month',
      refresh: 'Refresh',
      language: 'Language',
      languageChangeFailed: 'Unable to save the language preference.',
    },
    action: {
      cancel: 'Cancel',
      close: 'Close',
      delete: 'Delete',
      save: 'Save',
      saving: 'Saving',
    },
    item: {
      sessions_one: '{{count}} session',
      sessions_other: '{{count}} sessions',
      projects_one: '{{count}} project',
      projects_other: '{{count}} projects',
      warnings_one: '{{count}} warning',
      warnings_other: '{{count}} warnings',
      budgetPolicies_one: '{{count}} budget policy configured.',
      budgetPolicies_other: '{{count}} budget policies configured.',
    },
    value: {
      ok: 'OK',
      unknownDate: 'Unknown date',
      unknownModel: 'Unknown model',
      notSet: 'Not set',
    },
    state: {
      scanFailed: 'Scan failed',
      scanningTitle: 'Scanning local Codex sessions',
      scanningDescription: 'Read-only JSONL parsing. No edits, no uploads.',
      noSessions: 'No Codex sessions found',
      scannedPath: 'Scanned: {{path}}',
      periodEmptyTitle: 'No sessions in this period',
      periodEmptyDescription: 'No Codex sessions started during {{period}}.',
      period: {
        today: 'today',
        week: 'the last 7 days',
        month: 'the last 30 days',
      },
      budgetLoadingTitle: 'Loading budget center',
      budgetLoadingDescription: 'Reading local budget policies and model pricing.',
      budgetUnavailable: 'Budget center unavailable',
      budgetCenter: 'Budget center',
    },
  },
  notifications: {
    title: 'Token budget alert',
    metric: {
      token: 'Token',
      cost: 'Cost',
    },
    reached: '{{metric}} budget reached {{thresholdPercent}}%.',
  },
  settings: {
    dataPath: 'Data path',
    codexSessions: 'Codex Sessions',
    privacy: 'Privacy',
    localReadOnly: 'Local Read-only',
    privacyDescription:
      'The app reads local JSONL files only. It does not edit Codex data or upload usage.',
    costEstimate: 'Cost estimate',
    modelBasedEstimate: 'Model-based Estimate',
    costDescription:
      'Cost uses the model recorded in local sessions and the Budgets price table. Unknown models remain unpriced, and estimates do not represent an actual bill.',
    warnings: 'Warnings',
    scanWarnings_one: '{{count}} scan warning',
    scanWarnings_other: '{{count}} scan warnings',
    noWarnings: 'No parser warnings found.',
  },
  warnings: {
    'malformed-jsonl': 'Malformed JSONL line skipped.',
    'invalid-jsonl-record': 'Invalid JSONL record skipped.',
    'invalid-token-usage': 'Invalid token usage skipped.',
    'session-file-unreadable': 'Unable to read session file: {{details}}',
    'sessions-directory-unreadable': 'Unable to scan Codex sessions directory: {{details}}',
    'malformed-session-index': 'Malformed session index line skipped.',
  },
} as const;
