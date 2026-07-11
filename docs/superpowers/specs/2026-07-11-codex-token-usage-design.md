# Codex Token Usage Desktop App Design

## Goal

Build a local Electron desktop app that shows Codex token usage by day, project, and session. The first version reads Codex's local session JSONL files automatically and keeps all processing on the user's machine.

## Confirmed Decisions

- Data source: automatically scan `%USERPROFILE%\.codex\sessions`.
- Primary parser: JSONL session files, not the SQLite log database.
- Scope: token counts first, with optional cost estimation as a derived view.
- Visual direction: inspired by Lumo's privacy-first, calm, light, restrained interface, without copying Proton branding.
- Platform target: Windows first, with paths abstracted for future macOS/Linux support.

## Data Source

The app scans session files under:

```text
%USERPROFILE%\.codex\sessions\YYYY\MM\DD\rollout-*.jsonl
```

Each file is parsed line by line. The app uses:

- `session_meta` events for session id, start timestamp, working directory, model provider, source, and Codex version.
- `event_msg` events with `payload.type === "token_count"` for token usage snapshots.
- `payload.info.last_token_usage` as the per-turn usage increment.
- `payload.info.total_token_usage` as a consistency check and fallback if incremental data is missing.

The parser treats malformed lines as recoverable errors. A session with partial parsing errors should still appear with a warning marker if enough metadata and token data are available.

## Aggregation Rules

The normalized session record contains:

- `sessionId`
- `startedAt`
- `endedAt`
- `projectPath`
- `projectName`
- `threadName` when available from `session_index.jsonl`
- `inputTokens`
- `cachedInputTokens`
- `outputTokens`
- `reasoningOutputTokens`
- `totalTokens`
- `eventCount`
- `sourceFile`
- `warnings`

Daily totals are grouped by the user's local date derived from event timestamps. Project totals are grouped by `projectPath`, with `projectName` shown as the final path segment. Session totals are grouped by session file.

If both `last_token_usage` and `total_token_usage` exist, the app sums `last_token_usage`. If only total snapshots exist, it uses the largest total snapshot for the session. Cached input tokens are shown separately and are also included in total tokens exactly as Codex reports them.

## Cost Estimation

Cost estimation is optional and disabled by default in the first version. The UI can include a switch for "估算费用" once a model price table exists. The estimate is a derived calculation and never changes raw token totals.

Because model pricing changes over time, the first implementation should keep price data in a small editable TypeScript module or JSON file. Unknown models show token totals without cost.

## App Architecture

Use Electron, React, TypeScript, and Vite.

Main process responsibilities:

- Resolve default Codex session directory.
- Read session JSONL files with Node filesystem APIs.
- Parse and aggregate token usage.
- Expose a narrow IPC API to the renderer.
- Open a native directory picker later if the automatic path is missing.

Preload responsibilities:

- Expose `window.codexUsage.scan()`.
- Expose typed read-only methods only.

Renderer responsibilities:

- Render the dashboard, filters, charts, tables, empty states, and warnings.
- Never access the filesystem directly.
- Keep UI state such as date range, grouping, search, and cost toggle.

Shared code:

- Usage types.
- Aggregation helpers.
- Formatting helpers.

## UI Structure

The first screen is the usable dashboard, not a landing page.

Layout:

- Left sidebar: app name, privacy/local status, navigation items for Overview, Projects, Sessions, Settings.
- Top toolbar: date range selector, refresh button, search input, and cost-estimate toggle when available.
- Overview: total tokens, input, cached input, output, reasoning output, daily trend, top projects.
- Projects: ranked project table with total tokens, sessions, last activity, and share of total.
- Sessions: searchable table with session id/thread name, project, date, token columns, and warning status.
- Settings: detected Codex data path, rescan control, and pricing configuration placeholder.

Visual style:

- Light background with soft neutral surfaces.
- Compact 8px-radius cards for repeated metrics and tables.
- Quiet accent colors for charts and selected navigation.
- Clear privacy copy such as "本地只读扫描" in the status area.
- Dense but calm dashboard layout suitable for repeated use.

## Error Handling

The app should show:

- Empty state when no Codex sessions are found.
- Permission or missing-path message when `%USERPROFILE%\.codex\sessions` is unavailable.
- Partial-data warning when some files fail to parse.
- Per-session warning icons for malformed or incomplete files.

Parsing errors should not crash the app. The scan result should include both aggregated data and warnings.

## Testing

Core parser tests:

- Parses `session_meta`.
- Sums multiple `last_token_usage` events.
- Falls back to largest `total_token_usage` when increments are missing.
- Groups by local day.
- Handles malformed JSONL lines.

Renderer tests or smoke checks:

- Dashboard renders with sample data.
- Empty state renders with no sessions.
- Project and session tables sort correctly.

Manual verification:

- Run against the current user's `.codex\sessions`.
- Confirm totals match a small hand-inspected sample session.
- Start the Electron app and verify dashboard layout at desktop size.

## First Implementation Plan Boundary

The first implementation should deliver:

- Project scaffold.
- JSONL parser and aggregation.
- IPC scan API.
- Dashboard UI with overview, projects, sessions, and settings.
- Basic tests for parser and aggregation.
- Local dev command.

Out of scope for the first implementation:

- Packaging installers.
- Cloud sync.
- Editing or deleting Codex data.
- SQLite log parsing.
- Multi-user reporting.
- Fully automated model price updates.
