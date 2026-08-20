# Storefronts are hardcoded to `main` — should they follow the repo's default branch?

**Filed:** 2026-08-20, from the `kukla-bodea` field report.
**Status: CLOSED 2026-08-20 — decided on SCOPE, not on a platform constraint.**
Demo Builder makes throwaway demo storefronts from a template, so every repo it
touches is either created by us on `main` or reset from a `main` boilerplate.
Threading the branch through would cost ~19 call sites and seven URL builders
across publish, config generation, CDN URLs and reset, to serve a case
(a storefront already living on `master`) that has never been seen.

Deliberately NOT closed on "Adobe requires `main`" — that was claimed here
earlier and is still unproven. This decision does not depend on it, which is
why it is safe to make.

## The question

An existing repo whose default branch is `master` cannot be used. Should we
instead build the storefront on whatever branch that repo already defaults to?

## What is actually hardcoded

The service layer is **already parameterised** — whoever built it did it right:

- `helixService` and `helixApiClient`: ~12 methods take `branch: string`,
  defaulting to `DEFAULT_BRANCH` (`helixService.ts:55`).
- `githubRepoOperations.resetToTemplate` and `.hasContent` take `branch` too.

The hardcoding is at the CALL SITES and in the URL builders. Measured
2026-08-20: 31 raw `'main'` hits under `src/features/eds` (a few are false
positives such as `querySelector('main')`), plus the site URLs, which are the
user-visible half:

| Where | What it builds |
|---|---|
| `types/typeGuards.ts:391` | `https://main--{repo}--{owner}.aem.live` |
| `types/typeGuards.ts:443` | `https://main--{repo}--{owner}.aem.page` |
| `eds/handlers/blockLibraryPublish.ts:127` | block-library preview URL |
| `eds/services/configSyncService.ts:285` | CDN `config.json` |
| `eds/services/configGenerator.ts:500` | store URL written into config |
| `eds/services/edsResetRepoHelper.ts:63` | template source host |
| `eds/handlers/daLiveSiteConfig.ts:49` | DA.live editor canvas URL |
| `eds/handlers/storefrontSetupPhase3.ts:51` | `previewCode(..., 'main')` |
| `eds/handlers/storefrontSetupPhase1.ts:270` | `resetToTemplate(..., 'main')` |
| `eds/services/githubAppService.ts:197` | `admin.hlx.page/status/{o}/{r}/main` |

So this is a **threading exercise, not a redesign**. Roughly a dozen call sites
and seven URL builders, all mechanical.

## The platform question — STILL UNRESOLVED, and no longer load-bearing

**Does Adobe serve `.aem.live` from a non-`main` branch?**

**Not answered.** The closest thing Adobe says is ambiguous, and it was briefly
recorded here as definitive. From the aem.live go-live checklist
(`https://www.aem.live/docs/go-live-checklist`), fetched 2026-08-20 and
confirmed against the rendered page:

> One of the last steps in a go-live is usually to update your CDN to point to
> your `aem.live` endpoint. **Always use the `main` branch for production
> sites.**

And from the JSON2HTML doc in the same corpus, on branch-awareness generally:

> Like with everything else in Edge Delivery, this service is also branch-aware.
> That means you can push a config to a separate branch and use that branch for
> testing anything you would want to. Once you are satisfied with the testing,
> then you can push it up the main branch.

**Why that does not settle it.** "the main branch" reads two ways: a branch
literally NAMED `main`, or idiomatically "your primary branch". Every host in
Adobe's docs is `main--site--org`, which is equally consistent with both — their
repos all default to `main`. A search of the aem.live corpus for branch-NAMING
requirements (`default branch name repository requirement`, 2026-08-20) returned
nothing on the subject.

So the quote supports "production should run on your primary branch". It does
not establish that the ref must be spelled `main`.

**What IS settled, and is enough for today's guard.** The host is
`{ref}--{site}--{org}` where `ref` is the literal git ref, so a repo defaulting
to `master` gets `master--site--org`. Our seven URL builders emit
`main--{repo}--{owner}` unconditionally. That mismatch is real whatever Adobe
means, which is why the current guard stays.

**Probed 2026-08-20; still not settled.** Four measurements, with controls:

- `admin.hlx.page/status/skukla/team-bodea-demo/{ref}` returns `401 not
  authenticated` for `main`, `master`, `develop` AND `nonexistent-xyz`. Auth is
  checked before the ref, so **the ref is not part of site identity**.
- Against a live site with a passing control
  (`main--helix-website--adobe.aem.live` → 200), `master` and
  `nonexistent-xyz` also return 200 — so `.aem.live` does not reject non-`main`
  hostnames.
- But `master` and `nonexistent-xyz` came back BYTE-IDENTICAL (46,317) and both
  differed from `main` (46,758). `helix-website` has no `master` branch, so
  unknown refs FALL BACK. That is not evidence a real `master` branch serves its
  own code.

Still open, and it would still take a genuine master-branch Helix site or the
Code Sync team. It just no longer gates anything.

**A correction the probes forced.** This item and `siteUnknownReason` both said
Helix 404'd for `kukla-bodea` BECAUSE it had no `main` branch. That is wrong —
a known site 401s on a garbage ref, so the ref plays no part in the lookup. The
`404 no such site` was purely about `skukla/kukla-bodea` not being a known site.
The missing branch is a real problem for other reasons (the clone dies, the URLs
would be wrong); it was never the cause of the reported symptom.

**The instructive part — the reason this section is worth keeping.** This item
was filed on the premise that `main` was our parochialism, then closed an hour
later on a doc sentence read as definitive, then reopened when that reading was
challenged. Three positions on one question in one session. The doc quote is
evidence and was written up as proof; the difference is the whole point of the
item.

## Where the hardcoding actually bites

Three cases, and only two of them need this item:

- **A. The repo is not a storefront.** `repoStorefrontReadiness` already catches
  this by reading the repo's DEFAULT branch. The branch check adds nothing.
- **B. Reset is the offered remedy.** This is the sharp one. We tell the user
  "tick reset and setup will fix it", and `resetToTemplate` runs
  `git clone --depth 1 --branch main`, which dies. Measured 2026-08-20 against
  the live repo:

  ```
  git ls-remote --heads .../kukla-bodea.git
    9bff21d  refs/heads/master        <- only branch
  git clone --depth 1 --branch main .../kukla-bodea.git
    fatal: Remote branch main not found in upstream origin
  ```

  Readiness cannot see this — it inspects file contents, not refs.
- **C. A repo that IS a storefront but sits on `master`.** Readiness reports
  "storefront, all good", then every URL above targets `/main`. Nothing else
  catches it. **This is the case the item would serve, and neither the reporter
  nor this session has actually seen one.**

## Why "just fix the reset" does not work on its own

Making `resetToTemplate` clone the repo's real default branch is tempting and
insufficient: you then have template content on `master`, which lands straight
in case C. Making it work end to end means moving the repo to `main`, a much
bigger mutation than "reset the content" implies and not something to do
silently to someone's repository.

## Kickoff prompt

> This item is CLOSED on scope: Demo Builder builds throwaway demo storefronts
> from a `main` boilerplate, so the case this would serve does not arise. Reopen
> only if a real customer storefront on a non-`main` branch turns up — and if it
> does, note the platform question is still unresolved (the probes above are as
> far as it got) and settle that before threading anything. Do NOT reopen it on
> the strength of Adobe's "always use the main branch" quote; that sentence is
> ambiguous and has already been over-read once here.
