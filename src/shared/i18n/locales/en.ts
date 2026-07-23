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
    },
    value: {
      ok: 'OK',
      unknownDate: 'Unknown date',
      unknownModel: 'Unknown model',
      notSet: 'Not set',
    },
  },
} as const;
