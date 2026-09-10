---
id: EDS-11
kind: fix
area: eds
needs: []
value: low
status: dropped
---

# RETRACTED — HelixService's optional credentials are not the hazard I described

Filed 2026-08-28 and **retracted the same day, before any code changed.**
Recorded rather than deleted, because the way it was wrong is worth keeping.

## What I claimed

That `HelixService`'s three optional constructor parameters let any combination
compile including unworkable ones; that this caused a live 401 in August; and
that the fix was named factories per job — `helixForPublishing(...)`,
`helixForCodeSync(...)` — so a call site names a job instead of assembling a
credential tuple.

## What is actually true

**The incident was real and is already fixed — by a better mechanism than the
one I proposed.**

`src/extension.ts:340` registers ONE DA.live token source that every
HelixService falls back to, read at call time, before anything can construct
one. Its comment states the history directly:

> There is a single DA.live session per host, so threading it through each layer
> that builds a HelixService modelled a plurality that does not exist — and two
> construction sites were missing it, which made a Helix code publish 401 on any
> admin-locked site and leave the CDN serving a stale config.json.

So omitting the DA.live provider is not an error. It is the intended path: the
default answers. Passing one explicitly still wins, which is why several sites
do.

**And the other credential does not fail silently.** `HelixAdminAuth.getGitHubToken`
(`helixAdminAuth.ts:70`) throws immediately when the GitHub token service is
absent: *"GitHub authentication required for Helix Admin API. Please log in to
GitHub."* Loud, actionable, at the point of use.

## Why the retraction matters more than the item did

**My proposed fix was the thing the codebase deliberately moved away from.**
Named per-job factories threading a credential through every construction site
IS the per-layer threading the comment describes — and that threading is what
produced the August bug, because two of the sites forgot. Replacing a default
with eleven explicit decisions reintroduces eleven chances to forget.

The owner had approved a review of an 11-row mapping table built on this
premise. Producing it would have spent their time confirming a table whose whole
basis was refuted by a comment in `extension.ts`.

## What I got wrong, mechanically

Two pieces of evidence were read correctly and joined wrongly:

1. A test comment recording the incident — read as *current* rather than
   *historical*. It says "seen live 2026-08-15"; it does not say unfixed. A
   pinned regression test is evidence a bug WAS fixed.
2. `new HelixService(logger, undefined, tokenProvider)` — read as a caller
   stepping over a hazard. It is a caller passing an explicit provider where the
   default would also serve. Redundant, not dangerous.

The check that would have falsified it in one command, and was not run until
after the item was filed: **read who registers the default, and when.**

## Residual, if anything

Small and cosmetic. `logger, undefined, tokenProvider` at
`pdp/publishKeyRegistrar.ts:76` passes an explicit provider that duplicates the
activation default; the middle `undefined` is noise. Worth tidying whenever that
file is next open.

(Was line 87. It moved to 76 on 2026-08-31 when that construction was pulled into
a `realHelix` factory for the ADR-016 seam work — the observation is unchanged,
only its address. Caught by `rptc-hygiene-scan` section 6, which is what that
section is for.) Not worth an item — which is why this one is retracted rather
than rescoped.

## Standing lesson

The lesson the item was filed to make is still true and is now better
illustrated by the item itself: **"it's a variant" is the start of an inquiry,
not the end.** But so is "this looks like a hazard". Both need the same next
question — what does the code around it already do about this? — and here that
question had an answer sitting in a comment at the composition root.
