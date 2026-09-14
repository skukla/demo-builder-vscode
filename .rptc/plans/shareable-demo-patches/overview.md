# Shared demos: boilerplate provenance, patches that fit, and the version gap

Plan for [[EDS-13f]], opened 2026-09-14 on `feature/colleague-storefront` from
`.rptc/research/shareable-demo-patches/research.md`. Owner: "Commit and plan all of the
options. Make sure we also capture the boilerplate from which every storefront is built if
that's possible and the version."

## Decisions ledger

| # | Date | Decision |
|---|---|---|
| 1 | 2026-09-14 | **Every storefront records its boilerplate and its lineage.** Boilerplate = the `package.json` name and version of the storefront's code (both Adobe canonicals are `@adobe/aem-boilerplate-commerce`; the B2B line is 6.x, the B2C line 10.x). Lineage = GitHub's `template_repository` (the template a repository was generated from), the fork parent, or nothing. Read at add time for a link, from the files for a zip, at creation for a shipped brand; stored on the Welcome card (`AddedDemo`), on the project's storefront instance metadata beside `templateOwner/Repo/lastSyncedCommit/lkgSource`, and in the saved package's description (`builtWith`). Shown in the add dialog's "What we found" table and on the completion card in SC words ("Built on Adobe's Commerce boilerplate 4.0.1; the current one is 6.0.0"). |
| 2 | 2026-09-14 | **A saved package is a Demo Builder storefront, not a colleague's.** The description file (version 2) records `builtWith: { package, template, lkg, codePatchSource, codePatches, boilerplate, extension }`. Starting a project from it applies the ledger's patches where they fit, automatically, because both ends are the SC's own; it re-pins the repository to the ledger's last-known-good only when the canonical files it would replace are unchanged from the recorded pin (a hash compare), never over hand edits. Reset does the same. A description without `builtWith` (a colleague who did not build with Demo Builder, or a version-1 file) behaves as today. |
| 3 | 2026-09-14 | **A colleague's storefront that shows our lineage is offered our fixes, opt-in.** Revisits the 2026-09-11 "report only" decision on the evidence that the fit test only touches code the colleague did not change: a patch fits when its precondition matches exactly once, and the engine refuses everything else. Gate = lineage (decision 1); filter = fit. The completion card offers "Apply N Demo Builder fixes", default off, patches named by consequence, one commit, the same offer again on reset. Misses stay caveats. No lineage, no offer. Never a pin, never silent. Live evidence: five of seven fit on `sayurihanki/aistore`. |
| 4 | 2026-09-14 | **A zip is fingerprinted from its files.** No GitHub record exists; the boilerplate name and version come from the zip's `package.json`, and the fit test runs on the zip's file map before the repository is created (the engine is pure over a map). |
| 5 | 2026-09-14 | **The caveat names the line the extension already keeps.** It writes the integration contract (smart-404 snippet, block libraries, `fstab.yaml`, `config.json`, the description file) and never the colleague's own code. Today's wording "Demo Builder does not change this storefront's code" is replaced. |
| 6 | 2026-09-14 | **Version gap: report always, fix what fits, modernise only where a safe path exists (owner to confirm; step 05).** A repository FORKED from our template can be brought up to date with the existing fork sync (GitHub merge-upstream), once [[EDS-14]] makes a conflict stop instead of resetting. A repository GENERATED from the template (Jen's case) has no shared history, so the only mechanical path is a reset onto the current boilerplate, which destroys the colleague's work: never offered. Age alone never refuses an add: if the three canonical files exist and the integration contract can be written, the demo is addable, and the card says how old it is. Recommended floor: warn, do not refuse, below the oldest boilerplate our drop-in and config assumptions were verified on. |

## Steps

| Step | What | Depends on |
|---|---|---|
| 01 | Provenance capture: boilerplate name/version + lineage on card, project and saved package; dialog table and completion card copy (`step-01-provenance.md`) | — |
| 02 | A saved package stays a Demo Builder storefront: `builtWith`, fit-apply on create and reset, safe re-pin (`step-02-saved-package.md`) | 01 |
| 03 | Lineage + fit → opt-in fixes for a colleague's storefront, and for a zip from its files (`step-03-opt-in-fixes.md`) | 01 |
| 04 | Caveat and card wording (`step-04-wording.md`) | 01 |
| 05 | Version gap policy and the fork-sync door (`step-05-version-gap.md`) | 01, [[EDS-14]] |
| 06 | Acceptance on Jen's storefront and on a saved package of our own; docs (`step-06-acceptance.md`) | 02–05 |

Plan status: drafted 2026-09-14, awaiting the owner's answer on decision 6.
