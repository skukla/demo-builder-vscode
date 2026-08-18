# AEM Assets panel bound to the wrong environment for six months

**Status:** Root cause confirmed and fixed. Shipped on `fix/bug-sweep-2026-08-18`.
**Filed / closed:** 2026-08-18
**Origin:** Second field report from the same colleague. The first (2026-06-11,
`.rptc/complete/aem-assets-first-time-user-fix/`) was a different cause — a 401 on the
first-time org-config read — and was fixed in `.115`. This one is not that.

## Root cause

`demoBuilder.daLive.AEMRepositoryId` was renamed to `demoBuilder.daLive.aemAuthorUrl`
on 2026-02-02 (commit `062f09f7`). **Renaming a contributed setting does not migrate the
user's value.** VS Code stops reading the old key; the value stays in `settings.json`
doing nothing.

That alone would have been loud. What made it silent is the second half: `aemAuthorUrl`
shipped with a **non-empty default**. So `if (aemAuthorUrl)` stayed true, the binding kept
being written, and every run logged `Applied: aem.repositoryId` — with no indication that
the host was the bundled default rather than the configured one.

Every site created after 2026-02-02 — the author's and the colleague's alike — was bound
to the default AEM environment instead of the configured one. Sites created *before* the
rename kept working, which is why it read as a per-person problem for two investigations.

## Why it took two investigations

The log could not answer "which AEM is this site bound to?". `Applied: aem.repositoryId`
is true for every user in every run. The question was only answerable by reading the
user's `settings.json` and diffing it against `package.json` by hand — which is how it was
eventually found, not by any diagnostic the product offered.

## The fix

| Change | Why |
|---|---|
| `edsHelpers.ts` — summary names the bound host | `Applied: aem.repositoryId` was true for everyone and identified nothing. The next report is now decidable from the log alone. |
| `edsHelpers.ts` — `aem.repositoryId` cleared symmetrically | `editor.path` was already cleared when it had no value; the binding was not, so clearing the setting left a stale row forever. |
| `package.json` — `aemAuthorUrl` default is now `""` | A bundled default binds every user to one environment and reports success doing it. Matches `dataInstaller.apiBaseUrl` and the public-repo rule. Pinned by a test. |
| `orphanedSettings.ts` + Diagnostics | Lists any `demoBuilder.*` key the user has set that the extension no longer reads. Derived from the manifest, so it needs no rename registry and catches the next one. |

## Verification

Set the setting, reset a storefront, confirmed the log named the configured host and the
da.live Assets panel appeared. The specific hostnames are deliberately **not** recorded
here — this repository is public. They are in the author's VS Code settings and in local
agent memory.

## The general lesson

**A rename is a one-line change whose damage is invisible when a default can absorb it.**
Renaming a contributed setting silently discards the user's value; if the new key has a
default, nothing surfaces the substitution. Either ship no default (so the absence is
loud), or detect the orphan. This repo now does both.
