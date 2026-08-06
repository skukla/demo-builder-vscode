# Resume storefront setup after an AEM Code Sync install

**Filed:** 2026-08-06 · **Status:** ready · **Size:** half a day

## Provenance

`handleResumeStorefrontSetup` shipped as a stub — it always returned
`"Resume not yet supported"` — while the install dialog's success path posted to it and
the wizard optimistically advanced to `phase: 'code-sync'` first. The user watched setup
appear to continue and was then told to start over.

The stub was **deleted** (2026-08-06), not kept: an unbuilt path that cannot work is not
made acceptable by failing politely, and a registered handler invites the next person to
assume it works. This item is the other half of that decision — resume is buildable and
has real value, so it is written down rather than lost with the code.

Today's honest path: install detected → the step lands on its error state naming the
install success → **Retry** re-runs setup, which now passes the gate.

## Why it is worth building

Restarting re-does phases 1–2: the fstab push, block collection, smart-404 and quick-edit
writes. They are idempotent (`createOrUpdateFile` with an sha), so a restart is *safe* —
it costs a minute or two, not correctness. That is why this is not urgent.

It became rarer still on 2026-08-06, when the selection-time Code Sync check was restored
for existing repos (`dad3ee38`). The mid-pipeline gate now only fires when the App is
**revoked between selection and setup** — but that is precisely the case where the user
has real work in flight and a restart is most annoying.

## Why it is buildable

`executePhaseCodeSync(context, edsConfig, services, repoInfo, signal)` needs four things,
and three are free at resume time:

| needs | available? |
|---|---|
| `edsConfig` | yes — the webview already sends it in the resume payload |
| `services` | yes — reconstructed from `HandlerContext` as the start path does |
| `signal` | yes — a fresh `AbortController` |
| `repoInfo` | **derivable** — phase 1 resolves `{repoOwner, repoName, repoUrl}` from `edsConfig.createdRepo` / `selectedRepo` / `existingRepo`, read-only, no writes |

So the shape is: re-derive `repoInfo` using phase 1's existing resolution, then run phase 3
onward. No new persistence, no mid-pipeline state to thread across the pause.

## Execution plan

1. Extract phase 1's repo-resolution branch into a pure function (it already reads as one)
   so both start and resume call it.
2. Re-add `handleResumeStorefrontSetup`, implemented: resolve → `executePhaseCodeSync` →
   continue to the end of the pipeline.
3. Restore the dialog's success path to post `storefront-setup-resume` instead of landing
   on the error state, and re-register the message.
4. Invert the three tests that currently pin the handler's ABSENCE
   (`edsHandlers.test.ts`, `storefrontSetupHandlers.test.ts`, plus the handler-count pin at
   19) — they exist to stop the stub returning, and should flip deliberately when the real
   thing lands.

## Constraints

- Do NOT re-register the message before the handler works. The absence pins are there for
  exactly that.
- Resume must be idempotent against a partly-written repo — the user may have re-run setup
  manually before clicking resume.

## Kickoff prompt

> Implement resume-after-App-install per `.rptc/backlog/2026-08-06-resume-storefront-setup-after-app-install.md`.
> Start by extracting phase 1's repo resolution; the three absence pins flip as the last step.
