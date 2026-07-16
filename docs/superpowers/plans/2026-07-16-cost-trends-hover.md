# Cost Trends Hover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mouse and keyboard hover feedback with a complete daily token and cost tooltip to the Cost Trends chart.

**Architecture:** A pure exported helper converts `UsageDay` values into stable chart points with coordinates, cost, and tooltip placement. `TrendChart` owns only the active date, while transparent SVG hit targets drive a fixed-size HTML tooltip layered over the plot.

**Tech Stack:** React 18, TypeScript 5, SVG, CSS, Vitest 2, ESLint 10 with Airbnb rules

## Global Constraints

- Keep the chart panel, plot, and x-axis dimensions unchanged.
- Use a 12-unit transparent SVG hit radius.
- Support pointer enter/leave and keyboard focus/blur.
- Show date, estimated cost, total, input, output, and cached input values.
- Reuse `estimateTokenCost` and `formatNumber`.
- Keep tooltip content out of the accessibility tree; announce complete details through each hit target's `aria-label`.
- Align left-edge points left, center points centrally, and right-edge points right.
- Do not add runtime or test dependencies.
- Preserve Today, Week, and Month filtering behavior.

---

### Task 1: Build And Test Trend Point Metadata

**Files:**
- Modify: `src/renderer/components/Overview.tsx`
- Create: `tests/overviewTrend.test.tsx`

**Interfaces:**
- Produces: `TooltipPlacement = 'left' | 'center' | 'right'`.
- Produces: exported `TrendPoint` with `x`, `y`, `day`, `cost`, and `placement`.
- Produces: `buildTrendPoints(days: UsageDay[], max: number): TrendPoint[]`.

- [x] **Step 1: Write the failing point metadata tests**

Create `tests/overviewTrend.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { buildTrendPoints } from '../src/renderer/components/Overview';
import type { UsageDay } from '../src/shared/usageTypes';

describe('buildTrendPoints', () => {
  it('maps boundaries, cost, and placement for chart points', () => {
    const points = buildTrendPoints(
      [makeDay('2026-07-14', 100), makeDay('2026-07-15', 50), makeDay('2026-07-16', 25)],
      100
    );

    expect(points.map(({ x }) => x)).toEqual([24, 292, 560]);
    expect(points.map(({ placement }) => placement)).toEqual(['left', 'center', 'right']);
    expect(points[0].y).toBe(42);
    expect(points[0].cost).toBeCloseTo(0.000135);
    expect(points[0].day.inputTokens).toBe(60);
    expect(points[0].day.outputTokens).toBe(25);
    expect(points[0].day.cachedInputTokens).toBe(15);
  });

  it('returns no points for an empty period', () => {
    expect(buildTrendPoints([], 1)).toEqual([]);
  });
});

function makeDay(date: string, totalTokens: number): UsageDay {
  return {
    date,
    inputTokens: 60,
    cachedInputTokens: 15,
    outputTokens: 25,
    reasoningOutputTokens: 10,
    totalTokens,
    sessionCount: 1,
  };
}
```

- [x] **Step 2: Run the focused test and verify RED**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/overviewTrend.test.tsx
```

Expected: FAIL because `Overview` does not export `buildTrendPoints`.

- [x] **Step 3: Add named chart constants and point types**

In `src/renderer/components/Overview.tsx`, add:

```tsx
const CHART_VIEWBOX_WIDTH = 584;
const CHART_LEFT = 24;
const CHART_RIGHT = 560;
const CHART_BASELINE = 178;
const CHART_VERTICAL_RANGE = 136;
const TOOLTIP_LEFT_BOUNDARY = 160;
const TOOLTIP_RIGHT_BOUNDARY = 424;

export type TooltipPlacement = 'left' | 'center' | 'right';

export interface TrendPoint {
  x: number;
  y: number;
  day: UsageDay;
  cost: number;
  placement: TooltipPlacement;
}
```

- [x] **Step 4: Implement the pure helper and use it in TrendChart**

Add before `TrendChart`:

```tsx
export function buildTrendPoints(days: UsageDay[], max: number): TrendPoint[] {
  return days.map((day, index) => {
    const x =
      days.length <= 1
        ? CHART_LEFT
        : CHART_LEFT + (index / (days.length - 1)) * (CHART_RIGHT - CHART_LEFT);
    const y = CHART_BASELINE - (day.totalTokens / max) * CHART_VERTICAL_RANGE;
    const placement =
      x < TOOLTIP_LEFT_BOUNDARY ? 'left' : x > TOOLTIP_RIGHT_BOUNDARY ? 'right' : 'center';

    return {
      x,
      y,
      day,
      cost: estimateTokenCost(day.totalTokens),
      placement,
    };
  });
}
```

Replace the inline point map with `const points = buildTrendPoints(days, max);`. Replace literal path boundaries with `CHART_RIGHT`, `CHART_BASELINE`, and `CHART_LEFT`. Keep the SVG viewBox at `0 0 584 212`.

- [x] **Step 5: Verify GREEN, lint, and typecheck**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/overviewTrend.test.tsx
& 'C:\Program Files\nodejs\npm.cmd' exec eslint -- src/renderer/components/Overview.tsx tests/overviewTrend.test.tsx --max-warnings=0
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: both point tests pass, ESLint reports zero warnings, and both TypeScript projects pass.

- [x] **Step 6: Commit point metadata**

```powershell
git add src/renderer/components/Overview.tsx tests/overviewTrend.test.tsx
git commit -m "test: cover cost trend point metadata"
```

---

### Task 2: Add Interactive Hit Targets And Tooltip

**Files:**
- Modify: `src/renderer/components/Overview.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `TrendPoint[]` from Task 1.
- Produces: pointer and focus activation keyed by `UsageDay.date`.
- Produces: fixed-size `.trend-tooltip` overlay with placement modifiers.

- [x] **Step 1: Add active point state and tooltip position helpers**

Import `useState` from React and add:

```tsx
const CHART_VIEWBOX_HEIGHT = 212;
const TREND_HIT_RADIUS = 12;
const ACTIVE_POINT_RADIUS = 4.8;
const INACTIVE_POINT_RADIUS = 2.4;

function getTooltipStyle(point: TrendPoint): React.CSSProperties {
  return {
    '--tooltip-x': `${(point.x / CHART_VIEWBOX_WIDTH) * 100}%`,
    '--tooltip-y': `${(point.y / CHART_VIEWBOX_HEIGHT) * 100}%`,
  } as React.CSSProperties;
}
```

Inside `TrendChart` add:

```tsx
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const activePoint = points.find(({ day }) => day.date === activeDate);
```

- [x] **Step 2: Render guide, visible points, and transparent hit targets**

Wrap the SVG in `<div className="trend-chart-plot">`. After the trend line, render the active guide:

```tsx
{activePoint ? (
  <line
    className="trend-guide"
    x1={activePoint.x}
    x2={activePoint.x}
    y1={activePoint.y}
    y2={CHART_BASELINE}
  />
) : null}
```

Replace point circles with:

```tsx
{points.map((point) => {
  const active = point.day.date === activeDate;
  const ariaLabel = `${point.day.date}, ${formatNumber(point.day.totalTokens)} total tokens, estimated cost $${point.cost.toFixed(2)}`;

  return (
    <g key={point.day.date}>
      <circle
        className={active ? 'trend-point active' : 'trend-point'}
        cx={point.x}
        cy={point.y}
        r={active ? ACTIVE_POINT_RADIUS : INACTIVE_POINT_RADIUS}
      />
      <circle
        className="trend-hit-target"
        cx={point.x}
        cy={point.y}
        r={TREND_HIT_RADIUS}
        tabIndex={0}
        role="img"
        aria-label={ariaLabel}
        onMouseEnter={() => setActiveDate(point.day.date)}
        onMouseLeave={() => setActiveDate(null)}
        onFocus={() => setActiveDate(point.day.date)}
        onBlur={() => setActiveDate(null)}
      />
    </g>
  );
})}
```

- [x] **Step 3: Render the complete HTML tooltip**

After the SVG but inside `.trend-chart-plot`, add:

```tsx
{activePoint ? (
  <div
    className={`trend-tooltip ${activePoint.placement}`}
    style={getTooltipStyle(activePoint)}
    aria-hidden="true"
  >
    <strong>{activePoint.day.date}</strong>
    <div className="trend-tooltip-cost">
      <span>Estimated cost</span>
      <b>${activePoint.cost.toFixed(2)}</b>
    </div>
    <dl>
      <div>
        <dt>Total</dt>
        <dd>{formatNumber(activePoint.day.totalTokens)}</dd>
      </div>
      <div className="input">
        <dt>Input</dt>
        <dd>{formatNumber(activePoint.day.inputTokens)}</dd>
      </div>
      <div className="output">
        <dt>Output</dt>
        <dd>{formatNumber(activePoint.day.outputTokens)}</dd>
      </div>
      <div className="cached">
        <dt>Cached</dt>
        <dd>{formatNumber(activePoint.day.cachedInputTokens)}</dd>
      </div>
    </dl>
  </div>
) : null}
```

- [x] **Step 4: Add fixed-layout hover styles**

In `src/renderer/styles.css`, keep `.trend-chart` at 216px and replace the SVG height ownership with:

```css
.trend-chart-plot {
  position: relative;
  height: 190px;
}

.trend-chart svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

.trend-guide {
  stroke: #93a3b8;
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.trend-point {
  fill: #22c7d9;
  transition: r 120ms ease, filter 120ms ease;
}

.trend-point.active {
  filter: drop-shadow(0 0 4px rgba(34, 199, 217, 0.65));
}

.trend-hit-target {
  fill: transparent;
  stroke: transparent;
  cursor: crosshair;
}

.trend-hit-target:focus {
  outline: none;
}

.trend-hit-target:focus-visible {
  stroke: rgba(59, 130, 246, 0.55);
  stroke-width: 2;
}

.trend-tooltip {
  --tooltip-shift: -50%;
  position: absolute;
  z-index: 2;
  left: var(--tooltip-x);
  top: clamp(8px, calc(var(--tooltip-y) - 118px), 58px);
  width: 174px;
  padding: 10px 12px;
  transform: translateX(var(--tooltip-shift));
  border: 1px solid #dedede;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 8px 22px rgba(35, 38, 45, 0.16);
  color: #292929;
  pointer-events: none;
}

.trend-tooltip.left {
  --tooltip-shift: -8%;
}

.trend-tooltip.right {
  --tooltip-shift: -92%;
}

.trend-tooltip strong,
.trend-tooltip-cost,
.trend-tooltip dl div {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.trend-tooltip strong {
  font-size: 11px;
}

.trend-tooltip-cost {
  margin: 6px 0;
  padding-bottom: 6px;
  border-bottom: 1px solid #eeeeee;
  font-size: 11px;
}

.trend-tooltip dl {
  margin: 0;
  display: grid;
  gap: 3px;
}

.trend-tooltip dt,
.trend-tooltip dd {
  margin: 0;
  font-size: 10px;
}

.trend-tooltip dd {
  font-weight: 600;
}

.trend-tooltip dl div::before {
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border-radius: 50%;
  background: #777777;
  content: '';
}

.trend-tooltip dl div dt {
  margin-right: auto;
}

.trend-tooltip dl .input::before {
  background: #3b82f6;
}

.trend-tooltip dl .output::before {
  background: #a855f7;
}

.trend-tooltip dl .cached::before {
  background: #22c7d9;
}
```

- [x] **Step 5: Verify focused interaction integration**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' exec prettier -- --write src/renderer/components/Overview.tsx src/renderer/styles.css
& 'C:\Program Files\nodejs\npm.cmd' exec eslint -- src/renderer/components/Overview.tsx --max-warnings=0
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/overviewTrend.test.tsx tests/usageMath.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run build
```

Expected: focused tests pass, lint and typecheck pass, and the Electron renderer bundle builds without changing chart dimensions.

- [x] **Step 6: Commit the hover interaction**

```powershell
git add src/renderer/components/Overview.tsx src/renderer/styles.css
git commit -m "feat: add cost trend hover details"
```

---

### Task 3: Full Verification And Hook Simulation

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-cost-trends-hover.md` checkbox status only

- [x] **Step 1: Run full verification**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run build
```

Expected: all tests, Airbnb lint, Prettier, TypeScript, and Electron production build pass.

- [x] **Step 2: Stage the plan and simulate pre-commit**

```powershell
git add docs/superpowers/plans/2026-07-16-cost-trends-hover.md
git status --short
& 'C:\Program Files\Git\bin\sh.exe' .husky/_/pre-commit
```

Expected: only the plan is staged and the current `npm run lint:staged` hook exits successfully.

- [x] **Step 3: Re-run full verification after the hook**

Repeat the four commands from Step 1.

Expected: all commands still pass after hook processing.

- [x] **Step 4: Commit the completed plan**

```powershell
git diff --cached --check
git commit -m "docs: record cost trend hover implementation"
```

Expected: commitlint and pre-commit pass with no unrelated files included.
