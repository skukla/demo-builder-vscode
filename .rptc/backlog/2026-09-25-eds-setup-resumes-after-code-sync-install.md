---
id: EDS-20
kind: fix
area: eds
needs: []
value: high
status: built
---

# Setup resumes when the install dialog detects AEM Code Sync, instead of demanding a Retry

Filed 2026-09-25 as the follow-up to [[EDS-19]]; scoped for the owner ("scope this and help me
understand it"). Lane 1 once the design below is accepted.

## What happens today (read 2026-09-25)

1. Setup finds the App missing in one of two places: phase 1, before the first write, for an
   existing repository that already has a site; or phase 3, right after the site is registered,
   for a new or reset repository. It sends `storefront-setup-github-app-required` and returns
   `awaitingGitHubApp`; the run ENDS there. Nothing after phase 3's check has run: no site
   permissions, no CDN publish, no DA.live content copy.
2. The webview shows the install dialog: Install (opens GitHub) and Check Again (polls Adobe,
   leniently). When it detects the App, `handleInstallDetected` sets the step to an ERROR state
   whose text is "AEM Code Sync is now installed. Setup stopped before it could use it — select
   Retry to run it again." The comment beside it says why: "there is no resume".
3. Retry (`handleRetry`) resets `partialState` to nothing created and posts a fresh
   `storefront-setup-start` with the same configuration. The whole pipeline runs again from
   phase 1.

## What a full re-run costs

- A NEW repository already exists after the first run, so the second run's create is a create
  of a name that is taken; what `createRepoFromSource` does with that is the first thing to
  measure (it may fail, or it may fall back to a reset onto the source).
- An existing repository chosen WITH reset is reset a second time (destructive but idempotent).
- Phase 2 rewrites fstab and config (idempotent); phase 3 re-registers the site
  (`updateSiteConfig` is delete-then-re-register, which is exactly the path that once wiped the
  admin list — the capture-and-restore exists, but this is a second pass through it for no reason).
- `partialState.repoCreated` is false on the retry, so a Cancel during the second run no longer
  offers to delete the repository the first run created. A cleanup hole opened by the reset.

## Design (recommended): pause inside the run, the way the DA.live session already does

Setup already knows how to wait for the user inside one run: when the DA.live session expires,
the pipeline emits `auth-recovery`, waits for the re-authentication, logs "resuming", and
continues from where it was (`storefrontSetupPhases.ts`, `MAX_REAUTH_ATTEMPTS`, "Resuming
setup" / "Resuming content copy"). The App case wants the same shape:

- Where the App is found missing, do not return `awaitingGitHubApp`; send the dialog message
  and WAIT — poll Adobe's status at the existing lenient cadence, bounded (say 30 minutes, the
  Runtime timeout being the real ceiling), honouring the run's abort controller so Cancel still
  works.
- When the poll sees the App, log it, send a "resuming" progress line, and continue with the
  next step of the same phase. Nothing is repeated; `partialState` stays truthful.
- The dialog's Check Again becomes a nudge to the same poll (or simply disappears when the run's
  own poll succeeds); "select Retry to run it again" is deleted with the wall it explained.
- On the bound expiring: the existing error state, now honestly "waited N minutes for the App
  and did not see it", with Retry as the way back.

Alternative considered: a resume message that restarts the pipeline from phase 3 with the
saved `partialState`. It needs every phase to accept a starting point and re-derive what the
earlier phases produced (repo info, block collection ids); the in-run pause needs none of that.

## Verification block

Unit: the phase-3 gate waits and continues on detection, aborts on cancel, and ends with the
honest message on the bound; `partialState` unchanged across the wait. Live: a repository
without the App, installed while the dialog is up, finishes setup in the same run with the
green "AEM Code Sync verified" line and no Retry. The first measurement to take before building:
what `createRepoFromSource` does today when the name already exists.

## Shipped so far

- 2026-09-25  fix(eds): setup waits for AEM Code Sync inside the run and resumes where it paused (`b920b2936`)
- 2026-09-25  refactor(eds): the install dialog's "site not registered" screen was unreachable; delete it (`058e89e4b`)
