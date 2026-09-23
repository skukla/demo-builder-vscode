# Step 03 — Offer our fixes to a colleague's storefront that shows our lineage

## The gate and the filter

- **Gate: lineage** (step 01): `template_repository` or fork parent is one of our
  templates, or `builtWith.template` names one, or (weakest) the boilerplate package name
  matches and the SC is told the match is by name only. No lineage, no offer.
- **Filter: fit.** The load-bearing five plus the two universal patches (the `custom`
  ledger) are run through the engine against the repository's default branch (or the
  zip's files): applied-cleanly is offered, already-present is silence, precondition
  missing is a caveat (as today).

## The offer

On the completion card and again on reset: "Apply N Demo Builder fixes to this storefront",
default OFF, with the fixes named by consequence (the three groups
`loadBearingPatches.ts` already words, plus "header and account sidebar robustness" for the
universal two). Accepting writes one commit ("Demo Builder: N fixes", the patch ids in the
body) through the existing block/canonical patch writers, records the applied ids on the
project, and clears the matching caveats. Declining leaves the caveats. The agent surface
gets the same choice as an argument on the create/reset tools, never a default.

## A zip

The unpacked files are the engine's map: the fit test runs before the repository is created,
the dialog shows the result beside the boilerplate version, and the SC's choice rides into
the create request; applied fixes are part of the first commit.

## What is never done

No pin, no reset, no patch outside `blocks/` and `scripts/` `.js` (`patchTargetPolicy`),
nothing silent, nothing on a repository that shows no lineage.
