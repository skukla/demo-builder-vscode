# Step 02 — Extract a shared `InlineNotice` feedback component

## Problem

`OrgContextNotice` renders a bespoke `<div className="dashboard-org-banner">` with
hand-rolled CSS (`custom-spectrum.css:1901`). Every other shared status/feedback
surface lives in `core/ui/components/feedback/` (`StatusCard`, `StatusDisplay`,
`EmptyState`, `LoadingOverlay`, …). This banner is the odd one out: feature-local,
non-Spectrum-idiomatic, not reusable.

## Scope guardrail (read first)

The project SOP (`.rptc/CLAUDE.md`) flags "generic/reusable components with only 1
current use case." There is **one** persistent banner today. So this step is a
**structural move + light Spectrum alignment**, NOT a new variant system:

- `InlineNotice` exposes only what the single caller needs: `icon`, `title`,
  `children` (body), optional `hint`, and an `actions` slot.
- **No `tone`/`variant` enum** until a 2nd/3rd caller actually appears. The orange
  accent stays as the component's default styling.
- If review prefers, this step can be **deferred/dropped** without affecting Step 01.

## Approach

### RED — tests first

New `tests/core/ui/components/feedback/InlineNotice.test.tsx`:
- Renders title, body, hint (when provided), and actions slot.
- Omits hint when not provided.
- Forwards `data-testid`/role so callers can target it.

Keep the existing `org-mismatch-banner` testid assertions in
`ProjectDashboardScreen-orgMismatch.test.tsx` green (the public behavior is unchanged).

### GREEN — implementation

1. Create `src/core/ui/components/feedback/InlineNotice.tsx`:
   ```tsx
   export interface InlineNoticeProps {
     icon?: React.ReactNode;          // default AlertCircle
     title: React.ReactNode;
     children?: React.ReactNode;      // body message
     hint?: React.ReactNode;          // secondary line
     actions?: React.ReactNode;       // right-aligned action slot
     'data-testid'?: string;
   }
   ```
   Markup mirrors today's banner (icon / body{title,message,hint} / actions),
   using the renamed `.inline-notice*` classes.
2. Rename `.dashboard-org-banner*` → `.inline-notice*` in `custom-spectrum.css`
   (same rules, neutral name). Keep the orange accent as default.
3. Export from `core/ui/components/feedback/index.ts`.
4. Rewrite `OrgContextNotice` to compose `InlineNotice`, passing the `Switch IMS Org`
   button (with the Step 01 `isSwitching` state) into `actions` and the no-loop hint
   into `hint`. `OrgContextNotice` keeps owning the mismatch *logic* (message copy,
   `state !== 'mismatch'` early return); `InlineNotice` owns only presentation.

### REFACTOR

- Confirm no other component referenced `.dashboard-org-banner*` before renaming.
- Verify visual parity (same spacing/accent) — pure move, no behavior change.

## Acceptance

- `OrgContextNotice` behavior + testids unchanged; all existing tests green.
- New `InlineNotice` lives in `feedback/` with its own tests, ready for future reuse.
- No speculative variant API introduced.
