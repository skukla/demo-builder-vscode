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
| 6 | 2026-09-14 | **Version gap: report always, fix what fits, modernise only where a safe path exists (owner agreed 2026-09-14; step 05).** A repository FORKED from our template can be brought up to date with the existing fork sync (GitHub merge-upstream), once [[EDS-14]] makes a conflict stop instead of resetting. A repository GENERATED from the template (Jen's case) has no shared history, so the only mechanical path is a reset onto the current boilerplate, which destroys the colleague's work: never offered. Age alone never refuses an add: if the three canonical files exist and the integration contract can be written, the demo is addable, and the card says how old it is. Recommended floor: warn, do not refuse, below the oldest boilerplate our drop-in and config assumptions were verified on. |
| 7 | 2026-09-14 | **The card stays streamlined; the report is one door away.** Owner: "I don't want to litter a card in the project list with too many details … We need a way for someone to get to the report." A card (Welcome card, projects-list card) carries at most one short line about the storefront's origin ("Built on Adobe's boilerplate 4.0.1"); everything else (lineage, gap, which fixes fit, which were applied, what the extension wrote, the pre-render state) lives in a **Storefront report**, reached from the card's menu, from the completion card ("See the storefront report"), from the dashboard, and from the agent surface. One report, one shape, the same on every door. |
| 8 | 2026-09-14 | **Diagnostics learns the same facts.** "Demo Builder: Diagnostics" and its agent tool gain a storefront section: boilerplate name and version against the current template, lineage, the last-known-good pin the project is at, each load-bearing and universal patch's state (applied / fits / missing / target missing), the pre-render state already probed (overlay registered, smart-404 installed, source page published), and what the extension has written into the repository. The Storefront report of decision 7 is the SC-facing rendering of this section, not a second computation. |

## Steps

| Step | What | Depends on |
|---|---|---|
| 01 | Provenance capture: boilerplate name/version + lineage on card, project and saved package; dialog table and completion card copy (`step-01-provenance.md`) | — |
| 02 | A saved package stays a Demo Builder storefront: `builtWith`, fit-apply on create and reset, safe re-pin (`step-02-saved-package.md`) | 01 |
| 03 | Lineage + fit → opt-in fixes for a colleague's storefront, and for a zip from its files (`step-03-opt-in-fixes.md`) | 01 |
| 04 | Caveat and card wording; the Storefront report and its doors (`step-04-wording.md`) | 01 |
| 07 | Diagnostics gains the storefront section; the report renders it (`step-07-diagnostics.md`) | 01, 03 |
| 05 | Version gap policy and the fork-sync door (`step-05-version-gap.md`) | 01, [[EDS-14]] |
| 06 | Acceptance on Jen's storefront and on a saved package of our own; docs (`step-06-acceptance.md`) | 02–05 |

Plan status: complete 2026-09-14; owner agreed to decisions 1–6 and added 7–8. Build order: 01, 07, 02, 03, 04, 05 (after [[EDS-14]]), 06.
