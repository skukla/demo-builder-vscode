---
id: PL-106
kind: feature
area: platform
needs: []
value: med
status: backlog
---

# Retry only when it can help; Fix with AI when it cannot, everywhere

Filed 2026-11-19 from the beta.153 release walk (F298). The owner, on a failed JustRite template
update that offered Retry: "I was expecting to see Fix with AI here since even I don't even know what
next steps to take." Then: "Shouldn't this fix by kind decision be a convention that applies to the
entire codebase?" Yes; built for the Updates window only, before the release.

## The convention

A failure offers **Retry** only when a second try can behave differently, and then **Fix with AI**
once retrying has not helped. Any other failure offers **Fix with AI** at once. "Can a retry help?" has
ONE answer in this codebase: `classifyTransience` in `src/core/errors/index.ts`, which the automatic
retries already use (a timeout or the network: retryable; sign-in or unknown: not). The button rule is
`failedButtonLabel(retries, retryable)` in `src/core/utils/fixWithAi.ts`.

## What is built (F298, `fix/release-walk-fixes`)

- The Updates window: each failed row carries `retryable`, read off its raw words with
  `classifyTransience` before they are made plain; the row's button follows `failedButtonLabel`.
- While building it, a second classifier (`retryCanHelp`) was written, found to duplicate
  `classifyTransience`, and deleted the same day.

## Where a failure still offers Retry without asking (measured 2026-11-19, grep for a Retry label)

- `src/core/ui/components/feedback/OperationProgressModal.tsx:165`: every progress window's failure
  footer (Open Debug Logs and Retry). The widest one.
- `src/core/ui/components/selection/SelectionStepContent.tsx:201,230-232`: the wizard's pickers (it
  already refuses Retry for an org mismatch, by hand).
- `src/features/eds/ui/steps/StorefrontSetupStep.tsx:153`: storefront setup.
- `src/features/authentication/ui/steps/AdobeAuthStep.tsx:104,134`: Adobe sign-in (Retry Login).
- `src/features/project-creation/ui/components/integration-flow/apiAccessProblem.ts:48`,
  `CreateEntityBody.tsx:62`: the Add Integration flow.
- `src/features/data-installer/ui/dataInstallerFailure.tsx:66`; the job window, Dry Run and Clear
  already follow `failedButtonLabel` with the engine's own `retryable` (`importResult.ts`), so the data
  installer is the model, not the gap.
- `src/core/ui/components/integrations/IntegrationActionsMenu.tsx:42`, `ManageApisModal.tsx:93`.

## What it needs

1. **The flag has to travel.** Most of these screens only receive a plain message, so the extension
   must say `retryable` beside it, as `UpdateRowStatus` now does. The natural home is the shared
   failure shapes PL-102 slice 4 is retyping (`HandlerResponse`, `OperationOutcome`, the progress
   payload): do this with it, not separately.
2. **Fix with AI needs somewhere to go on each screen.** The Updates window and the data installer
   build a prompt from a record of the failure. Every other surface needs the same: the failure, what
   was being done, and `read_debug_logs`.
3. **`classifyTransience` may need "busy" and "rate limited".** HTTP 429 and 503 say "try later", and
   a request refused that way was not processed, so retrying is safe even for a write; other 5xx are
   not (a write may have run). Widening it changes the automatic retries too, so it waits for a
   measured pass, not a release week.

## Recommendation

Build it with PL-102 slice 4, area by area, after beta.153: the flag added to the failure shapes as
they are typed, each screen's Retry switched to `failedButtonLabel`, and a rule check that fails on a
Retry label offered without it.
