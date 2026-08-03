---
name: reuse-first
description: Check the house vocabulary BEFORE building a new UI surface, view, or component — find the existing component/hook/pattern that already does the job instead of rebuilding it. Use when creating any new file under a `ui/` directory, adding a loading/empty/error/sign-in/menu/progress view to any screen, or building a surface that resembles one that already exists (a second dashboard, a second picker, a second card grid).
---

# Reuse First

The extension already has a complete visual language. A new surface almost never needs a new
component — it needs the existing one, or an existing one with a new prop.

This skill exists because that keeps not happening. On 2026-07-31 a single new surface (the
integrations screen) shipped six rebuilds of things the wizard already had: the centered
loading view, the error+Retry view, the sign-in affordance, the kebab menu, the menu-icon
set, and the API-catalog feedback trio. **Every one was caught by the user, not by me** —
each arriving as "shouldn't this match what we already do?".

## The 60-second check (do this BEFORE writing)

```bash
ls src/core/ui/components/*/          # the shared vocabulary
ls src/core/ui/hooks/                 # the shared behaviour
```

Then read **`src/core/ui/components/CLAUDE.md`** — the job→component table (loading, empty,
error, status, menus, modals, layouts, rename, search, copy). Its hook counterpart is
`src/core/ui/hooks/CLAUDE.md`.

Then find the peer that already did your job:

```bash
# Who already renders this kind of view?
grep -rln "StatusDisplay\|LoadingDisplay\|EmptyState" src/features/
# Is there a screen like mine? (card grid, picker, wizard step, dashboard)
grep -rln "<the concept>" src/features/*/ui/
```

The wizard (`features/project-creation/ui/`) is the oldest and most complete surface. If you
are building anything that resembles a step, a picker, a summary, or a status view, **it
solved it first** — go look before you design.

## The rule

| Situation | Do |
|---|---|
| A shared component does the job | Use it |
| It almost does | Add a prop / variant to it |
| A peer FEATURE does the job, shared does not | Extract to `core/ui`, then both use it |
| Genuinely one-off | Keep it local, and say in the module docstring which shared component you rejected and why |

Extraction threshold is Rule of Three — **except** when the same behaviour has already been
fixed separately on two surfaces. That is demonstrated drift, and it gets extracted at two.
(Evidence: the API-catalog loading/error/sign-in views were each fixed on one surface and
hand-copied to the other within a single day before being extracted.)

## Vocabulary you will otherwise rebuild

The ones that actually got rebuilt, so check these first:

- **Feedback** — `LoadingDisplay` (+ `useElapsedStage` for long waits), `StatusDisplay`
  (error/info/success + `actions[]`), `EmptyState`, `StatusCard`, `StatusDot`,
  `CenteredFeedbackContainer`, `ApiCatalogFeedback`
- **Menus** — `CardActionsMenu` (the kebab shell) + `menuIcons.renderMenuIcon` (concept→glyph,
  so "open" is one glyph everywhere)
- **Auth** — signed-out is NEVER a Retry; it is a `StatusDisplay` whose action starts a
  user-initiated sign-in (`AdobeAuthStep` is the reference)
- **Chrome** — `Modal`, `PageLayout`/`PageHeader`/`PageFooter`, `InlineRenameField`,
  `SearchHeader`
- **Long extension work** — `vscode.window.withProgress` opened BEFORE the guards run, so the
  notification is immediate (see `withComponentProgress`)

## What this skill does NOT catch

It stops "I am about to build a loading view." It cannot stop "I rebuilt the wizard's
behaviour in a different shape" — that needs the after-the-fact scans, which exist and are
worth running when a feature lands: `component-extraction-scan` (UI markup ≥3 sites),
`code-duplication-scan` (logic), `architecture-duplication-scan` (competing implementations).

## Before finishing

If you DID add something to `core/ui`, add its row to `src/core/ui/components/CLAUDE.md` —
an index nobody updates becomes a reason to rebuild. Then run `gate`.
