# Project Session Drilldown Design

## Goal

Allow users to start from the Projects ranking and immediately locate the highest-token
sessions for one project. Clicking a project opens the existing Sessions view with an explicit
project filter, avoiding a new detail page while preserving a clear path back to all sessions.

## User Flow

1. The user selects a project row in Projects.
2. The application stores that project's full path as the selected project identity and switches
   to Sessions.
3. Sessions displays a removable project filter chip and only the matching sessions from the
   currently selected usage period.
4. Filtered sessions are ordered by total tokens descending, then by start time descending when
   totals are equal.
5. Removing the chip restores all sessions in their existing start-time-descending order.
6. Changing Today, Week, Month, or Total preserves the selected project filter.
7. Entering Sessions directly from the sidebar clears any project filter and shows all sessions.

The project filter is renderer-only transient state. It is not persisted across application
restarts.

## Architecture

`App` owns `selectedProjectPath: string | null` because the interaction coordinates two sibling
views and changes the active navigation item. It exposes three named handlers:

- Project selection stores the full project path and switches to Sessions.
- Sidebar navigation clears the project path when the user directly selects Sessions.
- Filter clearing resets only the selected project path and leaves Sessions active.

`AppContent` passes the project-selection callback to `ProjectsView`. For Sessions, it passes the
selected project path and the filter-clearing callback together with the period-filtered session
array.

Session filtering and ordering live in a renderer pure utility rather than component state.
The utility returns a new array and never changes the scan result:

- Without a selected project, it preserves the incoming session order.
- With a selected project, it applies an exact project-identity match, then orders by total tokens
  descending and start time descending.

Project aggregation and session selection must use the same project-identity rule. A non-empty
`projectPath` is its own identity; an empty path maps to one shared `UNKNOWN_PROJECT_KEY` constant.
This preserves the existing Unknown Project grouping while allowing that row to drill down
correctly. No additional case or slash normalization is introduced in this feature.

`SessionsView` memoizes the filtered session list from its incoming sessions and selected project
identity. The result is not stored as React state, so scan refreshes and period changes
automatically recompute from current data.

## Components

### ProjectsView

`ProjectsView` accepts `onProjectSelect(projectPath: string): void`.

Each data row becomes a native button styled as the existing table row. The full row is clickable
and keyboard accessible without custom key handlers. Hover and `:focus-visible` styles make the
interaction discoverable. The visible project name remains presentation text; the callback always
receives the full project identity.

### SessionsView

`SessionsView` accepts `selectedProjectPath: string | null` and a filter-clearing callback.

When filtered, its heading area displays:

- A chip labelled with the project name.
- The full path in the chip's `title` tooltip.
- A remove button whose localized accessible label includes the project name.
- The number of matching sessions.

The existing session columns and warning status remain unchanged. A filtered empty result replaces
the table body with a localized message and a button that clears the filter.

## State And Navigation Semantics

Project selection is a programmatic transition to Sessions and retains the newly selected filter.
Direct sidebar selection of Sessions is a user request for the top-level page and therefore clears
the filter. Navigating to other pages does not independently mutate the selected project, but
returning through the Sessions sidebar item clears it.

The usage-period control remains global for usage views. Its current value is unchanged when
drilling down, and later period changes retain the project identity.

Refreshing scan data retains the project identity. If the project no longer has sessions in the
current period, the UI reports an empty filtered result instead of silently changing to all
sessions.

## Empty And Error States

Existing application-level precedence remains unchanged:

1. Scan error
2. Scan loading
3. Entire scan empty
4. Selected usage period empty
5. Ready content

The project-specific empty state is rendered only in ready content when the selected period has
sessions but none belong to the selected project. If the entire selected period is empty, the
existing period-empty screen remains authoritative.

Malformed-session warnings do not exclude sessions from filtering or ordering. Invalid start
timestamps remain deterministic in token ties by falling back to the incoming order.

## Localization

Add English and Simplified Chinese copy for:

- The active project-filter label.
- The remove-filter accessible label.
- The filtered session count where existing count copy cannot be reused.
- The filtered empty title and description.
- The action that restores all sessions.

Project names and paths are user data and are never translated.

## Testing

Use test-driven development to cover:

- Project rows expose the selection interaction and report the full project identity.
- Selecting a project establishes the filter and changes the active view to Sessions.
- Direct sidebar selection of Sessions clears an existing project filter.
- Unfiltered selection preserves the incoming session order.
- Filtered selection returns only exact project matches.
- Filtered sessions sort by total tokens, then start time.
- Projects with the same display name but different paths remain separate.
- Empty paths use the shared Unknown Project identity in aggregation and filtering.
- Changing the usage period recomputes sessions while preserving the selected project identity.
- Clearing the chip restores all sessions.
- Filtered empty, warning, and refreshed-data states render correctly.
- New English and Simplified Chinese copy renders correctly.
- Project rows and the clear-filter control expose native keyboard semantics and accessible names.

After focused tests pass, run the complete test suite, type checking, linting, and the production
build.

## Non-Goals

- A dedicated project details page.
- Inline expansion inside the Projects table.
- Session detail drawers or event timelines.
- Free-text search, multi-project selection, arbitrary column sorting, or pagination.
- Persisting the selected project across application restarts.
- Changing project-path normalization across the scanner and aggregation pipeline.
- Changing the current usage-period definitions.
