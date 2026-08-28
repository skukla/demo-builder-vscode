---
id: EDS-11
kind: fix
area: eds
needs: []
value: high
status: backlog
---

# HelixService takes three optional credentials, so the wrong combination compiles

Filed 2026-08-28, out of the ADR-015 conversion work. Raised by the owner as a
question — "is this the right way to handle variance?" — about a class of thing
the conversion kept walking past.

## What is wrong

`HelixService` (`src/features/eds/services/helix/helixService.ts:178`) has this
constructor:

```ts
constructor(
    logger?: Logger,
    githubTokenService?: GitHubTokenService,
    daLiveTokenProvider?: DaLiveTokenProvider,
)
```

Different operations on it need different credentials. Minting a publish key and
publishing `config.json` need the DA.live token provider. Code sync and preview
need the GitHub token service. Status reads need neither.

Because all three parameters are optional, **every combination typechecks**,
including the ones that cannot work. Nothing connects "which method am I about
to call" to "which credential must be present". That knowledge lives as
convention across 11 construction sites.

## Evidence this is not theoretical

**It has already caused a live failure.** The witness for reset step 7 records
it in its own words (`tests/features/eds/services/reset/edsResetConfigStep.test.ts:13`):

> the tokenProvider reaches HelixService — without it the CDN keeps serving a
> stale config.json (401, seen live 2026-08-15)

A HelixService built without the right credential compiled, ran, and left the
CDN serving stale config until somebody noticed in production. There is a test
pinning that behaviour now, which is good, and the shape that allowed it is
still in place, which is the point of this item.

**A call site skips a parameter positionally.** `pdp/publishKeyRegistrar.ts:87`:

```ts
const helix = new HelixService(logger, undefined, tokenProvider);
```

Passing `undefined` to step over a middle argument is the visible symptom of a
constructor that asks callers to assemble a combination rather than name a job.

**Measured 2026-08-28:** 11 construction sites, at least 5 distinct argument
shapes among them.

## Proposed shape

Replace the optional-parameter constructor with named factories, each taking the
credential its job actually requires:

```ts
helixForPublishing(daLiveTokenProvider, logger)   // publish keys, config.json
helixForCodeSync(githubTokenService, logger)      // code sync, preview
helixForStatus(logger)                            // read-only status
```

The call site then picks a job. The compiler rejects a publishing call built
with GitHub credentials. The variance stays — it is real — but becomes a small
closed set of checkable cases instead of eight tuples of which several are
silently wrong.

## Why this needs a human, unlike the rest of the conversion

Every other ADR-015 conversion was behaviour-preserving and proved itself by
leaving assertions untouched. This one changes which credential reaches a
network call. The failure mode is precisely the 2026-08-15 incident: it
compiles, it runs, and the damage appears later somewhere else. Mapping each of
the 11 sites to the right factory needs someone who knows which operation each
one performs; it cannot be inferred from the call shape, because the call shape
is what is wrong.

## Scope

- `HelixService`: 11 construction sites, one class.
- Then ask the same question of `DaLiveContentOperations` and
  `ConfigurationService`. Both take a **required** token provider, so they are
  already safer and may need nothing — confirm rather than assume.

## The general lesson this came from

The conversion work repeatedly found near-duplicate structures, checked them,
concluded "variants, not duplicates", and stopped. That verdict is a beginning,
not an end: it establishes THAT something varies, and says nothing about whether
the variation is **modeled** (expressed so it cannot be got wrong) or merely
**accidental** (divergence nobody has looked at). This item is what one
unexamined "it's a variant" was hiding.

Related: D-3 in `.rptc/plans/architecture-test-convergence/decisions-for-owner.md`.
