---
id: PL-81
kind: epic
area: platform
needs: []
value: med
status: backlog
---

# Every choice the SC makes is asked in a modal, not a notification

Filed 2026-10-16 from the release-candidate walk. The owner's question: should every
notification that asks the SC to choose something (a button to press, a list to pick
from) become a modal instead? PL-80, the Check for Updates picker, is the first case.

## Size (a pattern search over `src/`, 2026-10-16 — approximate, read before trusting)

- About 64 `showInformationMessage` / `showWarningMessage` / `showErrorMessage` calls
  that carry choice buttons (29 / 30 / 5), most in eds, commands, core, updates and
  dashboard.
- About 17 pickers and input boxes (`showQuickPick` 8, `createQuickPick` 3,
  `showInputBox` 6).

The count matched on the call's argument shape, so it includes some calls whose extra
arguments are options rather than buttons. The first task is a real inventory, one row
per site, read by hand.

## What already exists

- `withModalAsking` / `OperationPromptForm` (PL-59): while a progress modal is open, a
  question the run asks (a DA.live sign-in, a confirmation) is shown inside that modal
  rather than as a notification.
- The picker-to-modal pattern (`operationIds.ts`, `syncStorefront.ts`,
  `useComponentOperation.ts`): the projects list asks which project in its own modal.
- Configure's Republish now runs in the Configure screen's progress modal (2026-10-15).

## The question each site must answer

A modal needs a screen. A prompt raised at activation, in the background, or with no
panel open either opens a screen to ask in, or stays a notification. That split is the
design decision; the rest is applying the existing patterns.

## Children

- PL-80: Check for Updates in a modal, with the updates already ticked.
