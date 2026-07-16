# Cost Trends Hover Design

## Goal

Add a polished hover and keyboard-focus interaction to every Cost Trends data point without changing the chart or panel dimensions.

## Interaction

- Each visible point receives a transparent SVG hit target with an effective radius of 12 view-box units.
- Pointer enter activates the point; pointer leave clears it.
- Keyboard focus activates the same point; blur clears it.
- The active point grows visibly and displays a vertical guide line from the plot baseline to the point.
- Only one point can be active at a time.
- Changing Today, Week, or Month replaces the chart data and clears an active point that no longer exists.

## Tooltip Content

The floating tooltip displays the active day's:

- full local date;
- estimated cost derived from `totalTokens` through the existing `estimateTokenCost` helper;
- total tokens;
- input tokens;
- output tokens;
- cached input tokens.

Token values use the existing `formatNumber` formatter. Cost uses two decimal places. Input, Output, and Cached rows use the chart's existing color swatches.

## Layout

Wrap the SVG in a fixed-height, relatively positioned plot container. Render the tooltip as an absolutely positioned HTML element above the SVG, with `pointer-events: none`, so it does not interrupt hover transitions.

Map the SVG point coordinates to percentage-based `left` and `top` positions. Points in the left region align the tooltip from its left edge, points in the center use centered alignment, and points in the right region align from the right edge. Clamp the vertical tooltip position through CSS so the tooltip remains inside the plot and does not resize surrounding content.

The existing x-axis remains below the fixed-height plot container. Tooltip content must remain legible at the application's minimum window width.

## Accessibility

- Transparent hit targets are keyboard focusable.
- Each hit target has an `aria-label` containing the date, total token count, and estimated cost.
- Focus uses the same visible point, guide line, and tooltip treatment as pointer hover.
- The tooltip itself is presentational and does not duplicate announcements.

## Architecture

`TrendChart` owns the active date in local React state. A pure `buildTrendPoints` helper produces coordinates and display-ready tooltip values from `UsageDay[]` and the chart maximum. The active point is resolved from the current points on each render, preventing stale tooltip data after a period change.

Point-coordinate constants remain named constants rather than inline numeric literals. The helper is exported for focused unit testing; `Overview` remains the default component export.

## Testing

Unit tests cover:

- coordinate generation for the first and last points;
- cost and token detail values for a point;
- left, center, and right tooltip placement classification;
- empty input producing no points.

The existing period-filter tests continue proving that the chart receives the selected Today, Week, or Month data. Final verification runs the full Vitest suite, Airbnb lint with zero warnings, Prettier, both TypeScript projects, and the Electron production build.

## Non-Goals

- Continuous interpolation between daily points.
- Dragging, zooming, or selecting a date range from the chart.
- Adding separate Input, Output, and Cached trend lines.
- Changing token-cost pricing assumptions.
