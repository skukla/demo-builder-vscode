# Plan: IMS Org Mismatch — Action Feedback + Reusable Notice

**Source research:** `.rptc/research/ims-org-mismatch-notification/research.md`
**Branch:** `claude/ims-mismatch-notification-treo89`
**Decision:** Keep the banner (do NOT convert to a progress/toast notification).
Close the two real gaps the research found.

## Goals

1. **Step 01 — Action feedback on `Switch IMS Org`** (the legitimate "blocking
   progress" moment). Today `handleSwitchOrg` just posts the message with no
   in-flight state, so during the multi-second forced-login + re-verify the button
   stays live and silent. Add an in-flight state: disable the button + show a
   spinner / "Switching…" until the next `orgContextResult` resolves.

2. **Step 02 — Make the banner a shared, Spectrum-aligned feedback component.**
   `OrgContextNotice` is a bespoke `<div className="dashboard-org-banner">` in an
   otherwise Spectrum webview. Move the presentational shell into the established
   `core/ui/components/feedback/` family (peer of `StatusCard`, `StatusDisplay`,
   `EmptyState`) as a minimal `InlineNotice`, and have `OrgContextNotice` consume it.

## Non-goals / guardrails (per project SOP — avoid premature abstraction)

- **Do NOT build a variant-rich generic alert system.** There is exactly ONE
  persistent-banner use case today (org mismatch); the `needs-auth` case is a plain
  inline `Link`, not a banner. A tone/variant matrix for one caller would trip the
  YAGNI red flag in `.rptc/CLAUDE.md`. `InlineNotice` stays minimal: an icon slot,
  title, body/hint, and an actions slot — no speculative `tone` enum beyond what
  the single caller needs.
- **Do NOT convert to `vscode.window.withProgress` or a toast** — out of scope by
  the research conclusion (transient surfaces drop the standing affordance).
- Reuse existing tokens/CSS where possible; don't duplicate styling.

## Files in scope

| File | Change |
|---|---|
| `src/features/dashboard/ui/hooks/useDashboardActions.ts` | `handleSwitchOrg` sets an in-flight flag |
| `src/features/dashboard/ui/ProjectDashboardScreen.tsx` | Thread `isSwitchingOrg` into `OrgContextNotice`; clear it when the org check resolves |
| `src/features/dashboard/ui/components/OrgContextNotice.tsx` | Accept `isSwitching`; disable button + spinner; consume `InlineNotice` |
| `src/core/ui/components/feedback/InlineNotice.tsx` (new) | Minimal shared presentational banner |
| `src/core/ui/components/feedback/index.ts` | Export `InlineNotice` |
| `src/core/ui/styles/custom-spectrum.css` | Generalize `.dashboard-org-banner*` → `.inline-notice*` (or keep class, move out of dashboard-specific naming) |

## Existing tests to extend (TDD)

- `tests/features/dashboard/ui/ProjectDashboardScreen-orgMismatch.test.tsx`
- `tests/features/dashboard/handlers/dashboardHandlers-switchOrg.test.ts`
- New: `tests/core/ui/components/feedback/InlineNotice.test.tsx`

## Sequencing

Step 01 (behavioral, self-contained) first — it's the higher-value fix and ships
independently. Step 02 (refactor/extraction) second — pure structural move, no
behavior change, lower risk to defer or drop if scope tightens.

See `step-01-action-feedback.md` and `step-02-reusable-notice.md`.
