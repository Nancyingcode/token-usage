# Rolling Period Filter Design

## Goal

Make the Today, Week, and Month toolbar controls filter every usage-oriented view so totals, charts, projects, sessions, and performance metrics always describe the same rolling period.

## Period Semantics

- `today`: local midnight at the start of the current day through the supplied current time.
- `week`: local midnight six days before the current day through the supplied current time, covering seven calendar days including today.
- `month`: local midnight twenty-nine days before the current day through the supplied current time, covering thirty calendar days including today.
- A session belongs to a period according to `startedAt`.
- Sessions with invalid timestamps or timestamps after the supplied current time are excluded.
- Month remains the initial selection to preserve the current visual default.

## Architecture

Add a shared `UsagePeriod` type and a pure summary-filtering function next to the existing usage aggregation functions. The function accepts the unfiltered `UsageSummary`, a period, and an injectable current time. It filters `summary.sessions` and passes the matching sessions back through `buildUsageSummary`, keeping totals, daily groups, project groups, shares, and session ordering consistent.

The renderer `App` owns the selected period. It derives the filtered summary with `useMemo` and passes that summary to Overview, Sessions, Projects, and Performance. The toolbar becomes a controlled segmented input with the selected period and change callback supplied by `App`.

Scanning remains unchanged. Switching periods performs no file reads, IPC calls, or duplicate aggregation logic.

## User Interface

- Today, Week, and Month buttons all respond to clicks.
- Exactly one button has the active state and `aria-pressed="true"`.
- The existing button order, dimensions, and visual styling remain unchanged.
- Refresh preserves the selected period and applies it to newly scanned data.
- When the full scan contains sessions but the selected period contains none, show a range-specific empty state instead of the directory-level empty state.
- Sidebar warning count and Settings scan warnings remain scan-wide diagnostics because warnings are not reliably attributable to a successfully parsed session.

## Data Flow

1. The Electron scan returns the complete `UsageScanResult`.
2. `App` stores the complete result and selected `UsagePeriod` independently.
3. `filterUsageSummary` calculates the rolling start boundary from local midnight and the inclusive upper boundary from the supplied current time.
4. The function filters sessions by `startedAt` and calls `buildUsageSummary` with the matching sessions.
5. Usage views render the derived summary; changing the period recomputes it without rescanning disk.

## Error And Empty States

- Existing scan failures and loading states retain priority over period rendering.
- An entirely empty scan continues to use the existing Codex directory empty state.
- A non-empty scan whose selected period is empty displays `No sessions in this period` and keeps the toolbar available for another selection.
- Invalid session timestamps are excluded rather than causing rendering failures.

## Testing

Unit tests use an injected local current time and cover:

- a session from today included in all periods;
- a session exactly six days old included in Week;
- a session seven days old excluded from Week;
- a session exactly twenty-nine days old included in Month;
- a session thirty days old excluded from Month;
- future and invalid timestamps excluded;
- rebuilt totals, projects, days, and sessions matching the selected period.

Renderer verification covers controlled toolbar state, click callbacks, range-specific empty rendering, TypeScript checks, Airbnb lint, and the production Electron build.

## Non-Goals

- Calendar week or calendar month filtering.
- Custom date pickers or persisted period preferences.
- Backend rescans when a period changes.
- Filtering parser warnings by period.
