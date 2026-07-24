# Total Usage Period Design

## Goal

Add a Total option beside Today, Week, and Month so every usage-oriented view can display all scanned sessions without applying a time boundary. Persist the selected option across application restarts, while retaining Month as the fallback for users without a valid saved preference.

## Period Semantics

- `today`, `week`, and `month` retain their existing rolling local-calendar-day behavior.
- `total` includes every session in the complete scanned `UsageSummary`, regardless of `startedAt`.
- The selected period applies consistently to overview totals and trends, projects, sessions, and performance metrics.
- Month remains the default when no saved selection exists, the saved value is invalid, or browser storage cannot be read.

## Architecture

Extend the shared `UsagePeriod` union with `total`. Keep `filterUsageSummary` as the single selector for usage summaries, but return the complete summary for Total instead of calculating a date range.

Add a small renderer utility dedicated to the usage-period preference. It reads and validates the value stored in `localStorage`, writes only supported `UsagePeriod` values, and hides storage failures from the UI. The utility accepts a minimal storage interface so its behavior can be tested without a browser environment.

The renderer `App` initializes its period state lazily from the preference utility. A named change handler updates the controlled React state and then attempts to persist the selection. A persistence failure does not roll back the visible selection because the filter remains usable for the current application session.

No Electron main-process storage, IPC channel, preload API, or disk configuration file is added. This preference affects only renderer presentation and contains no sensitive data.

## User Interface

- The toolbar order is Today, Week, Month, Total.
- Exactly one option remains active with `aria-pressed="true"`.
- English displays `Total`; Simplified Chinese displays `全部`.
- The selection is preserved when changing views or refreshing scan data.
- Restarting the application restores the last valid selection.
- A fresh installation or invalid saved preference starts on Month.
- Budget views continue hiding the usage-period controls.

## Data Flow

1. `App` lazily loads the saved period from renderer storage.
2. The Electron scan returns the complete `UsageScanResult`.
3. `filterUsageSummary` returns the complete summary for Total or rebuilds the summary from sessions matching the selected rolling period.
4. Usage views render the resulting summary.
5. Selecting another option updates state immediately and attempts to save the new value to `localStorage`.

## Error And Empty States

- Storage read failures, missing values, and unsupported values fall back to Month.
- Storage write failures are ignored after the in-memory state changes.
- An entirely empty scan continues to use the existing directory-level empty state.
- Total cannot produce a period-specific empty state when the complete scan contains sessions because it uses that complete summary.
- Existing loading and scan-error precedence remains unchanged.

## Testing

Use test-driven development to cover:

- Total returns all scanned sessions, including sessions older than thirty days.
- Total does not apply current-time validation or rolling date boundaries.
- The toolbar renders four options in the required order, marks Total when selected, and reports Total clicks.
- A valid stored selection is restored.
- Missing, invalid, or unreadable storage falls back to Month.
- Saving writes a valid selection and safely tolerates storage failures.
- Existing Today, Week, and Month filtering behavior remains unchanged.

After the focused tests pass, run the complete test suite, type checking, linting, and the production build.

## Non-Goals

- Custom date ranges or calendar pickers.
- Persisting usage-period preferences through the Electron main process.
- Synchronizing the preference across devices or operating-system accounts.
- Changing budget-period semantics.
- Changing the existing rolling definitions of Today, Week, or Month.
