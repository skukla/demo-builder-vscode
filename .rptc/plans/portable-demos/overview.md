# Portable demos — plan (living; iterated with the owner)

Program: [[EDS-13]]. Research: `.rptc/research/colleague-storefront/research.md` (§1–§12) and
`.rptc/research/project-import-export/research.md`. Branch `feature/colleague-storefront`
(worktree from `origin/develop`). This plan records the decisions made so far and the slices
they imply; it is a hypothesis, revised as iteration continues. Steps whose design is not yet
settled say so at the top.

## Goal, in the SC's words

"Build my project on the demo Jen made" works the way "build it on CitiSignal" works: pick a
card, carry on. And "let Jen build on mine" is one action. Underneath, the project's own
export, import and copy carry the whole project, on one versioned file.

## Context and constraints (from research)

- A storefront is a catalog row keyed by package + stack; the project stores only the key,
  and eleven post-creation sites re-resolve it against the bundled JSON. Reset refuses
  outright for an unknown id. (research §1, §3b)
- Template identity is ALREADY persisted on the EDS component instance and read by the
  update checker, while reset re-derives it from the catalog: two resolvers today. (§3a)
- GitHub generates a repo only from a template-flagged repo; content copy reads the
  published `aem.live` index. A colleague's repo names its content site in `fstab.yaml` and
  its store codes and B2B flags in `config.json`. (§1, §3d, §8)
- The generator rewrites `config.json` wholesale on every create and reset (ADR-009), so a
  storefront's own flags survive only if we re-express them.
- The settings file (v1) carries about a third of the manifest; import creates integrations
  and mesh empty regardless of the file; there is no migration; both dashboard export doors
  write secrets unconditionally. (import/export research)
- Repo laws that bind every step: reversibility (P1), never overwrite a user's edits via the
  ADR-013 seam (P2), existing projects keep working (P3), public repo (P4), cloud ops are
  real (P5); nothing soft-deprecated; hit every surface (eight bundles, creation = regenerate,
  human surface = agent surface, JSON + schema + type, mocks audited, docs pinned).

## Decisions ledger (owner, 2026-09-11)

| # | Decision | Where it bites |
|---|---|---|
| D1 | A shared storefront is its own brand card, at the brand level, not a frontend swap | shareable-demo 04, 05 |
| D2 | Paste a link; the PROJECT stores the synthesized storefront row; the link is remembered in the SC's user settings | shareable-demo 04, 05, 06 |
| D3 | Edge Delivery and headless both; the probe tells which | shareable-demo 03 |
| D4 | The colleague owns the storefront; we own the integration contract. Reset → the demo's source (the SC's fork by D16, else their `main`); no LKG pin, no patches, no brand assets. The five load-bearing code patches are dry-checked; each miss is a caveat | shareable-demo 05, 06 |
| D5 | Copy their published pages whenever a published index exists; skip with a note when none (AMENDED 2026-09-11: the skippable half dropped, no tick for anyone); probe the index before Continue | shareable-demo 03, 05 |
| D6 | Prefill exactly what shipped brands prefill: the three store codes, read from their `config.json` | shareable-demo 03, 05 |
| D7 | B2B: detect from `config.json`, then the dependency list; only when both fail show a switch, off by default, with a plain reason; the answer is stored with the project and re-expressed on every regenerate | shareable-demo 03, 04, 05, 06 |
| D8 | Words: plus card "Add a demo"; shipped "Custom (B2B + B2C)" → "Starter (B2B + B2C)"; "shared", "custom", "import", "from GitHub" rejected (research §9) | shareable-demo 02, 04 |
| D9 | The door opens the Add Integration dialog shape; EVERY surface, pattern and word is an existing one (research §9a is the gate) | shareable-demo 04 |
| D10 | A colleague may commit a description file: exactly what a shipped catalog entry may say; it wins over what we read, and we say what it overrode | program 01, shareable-demo 03 |
| D11 | "Share this demo" / "Stop sharing" writes that file from a project; template flag is an off-by-default tick box | shareable-demo 09 |
| D12 | Team catalog after add and share ship | later |
| D13 | ONE contract: the versioned project file; the storefront description is the slice that travels with a repo | program 01 |
| D14 | Copy and Edit both stay, fed by that one complete file | PL-56 children |
| D15 | Agent surface ships with each human surface | shareable-demo 07, 09; PL-56f |
| D16 | Fork on add, ticked by default: the SC's fork is the demo's source; updates are "Pull Jen's changes"; Forget offers to delete the fork | shareable-demo 04–07 |
| D17 | Source gone (unforked): dashboard notice, reset refuses up front, rename self-heal, "Change source" repoints via the Add dialog; content gone: reset offers to keep current content | shareable-demo 06 |
| D20 | A demo's blocks always arrive complete: they are code in the generated repo, the palette is generated from that code, and the example pages are copied from the demo's content site as library doc pages regardless of the page copy | shareable-demo 05 |
| D21 | The Storefront area names the demo: a first summary row "Demo — Isle5 by Jen · Edge Delivery" and the existing-repo tick reads "Reset to Isle5 by Jen (replaces all content)"; same for shipped brands | shareable-demo 05 |
| D22 | A shared demo's blocks belong to that demo only: Add never registers them as a block library for other demos; the palette and example pages come with the demo itself | shareable-demo 05 |
| D23 | Dry-check caveats are worded by consequence in the SC's words (three lines for five patches, ids only in the debug log), shown in the completion card at create and again at reset; nothing persists on the dashboard | shareable-demo 05, 06 |
| D24 | The project file never carries a credential (no include flag, no stamp); it shares the demo's SHAPE. Import names what the receiver must supply and the existing Commerce step collects it; same-machine Copy moves credentials keychain to keychain; follow-on: offer reuse of a login already saved for the same backend | PL-56a, 56c, 56d |
| D25 | Everything else can travel; stale sign-ins and Adobe context are re-proven through the EXISTING prompts (edit-mode seeding, "Switch IMS Org") before anything continues | PL-56a, 56d |
| D26 | The description file (and a shipped catalog entry) may name the datapack the demo expects; the Sample Data step pre-selects it and says why; the SC can change it | program 01, shareable-demo 05 |
| D27 | Share this demo is Edge Delivery only in v1; a headless project has no repo of the SC's own; headless Share is EDS-13e | shareable-demo 09 |
| D28 | The fork lives in the SC's personal GitHub account only; no team-org forks in v1 | shareable-demo 04, 05, 06 |
| D29 | The description file (and a shipped catalog entry) may name integrations the demo depends on: catalog ids and custom-app links; the Integrations area starts with them added | program 01, shareable-demo 05 |
| D30 | A link to one of our own templates (exact owner/repo, never a fork) is recognised and selects the shipped card | shareable-demo 03, 04 |
| D31 | Data on import/add: the named datapack (name + version) is pre-selected in Sample Data, community packs shown when needed; the banner says to install it from the dashboard, or that it is not published and the owner must export it; no install runs during creation | shareable-demo 05; PL-56d |
| D32 | Share and Export check reachability: a pack missing from the datapack service offers the owner's own stage-3 export; a private custom-app repository offers to make it public (a confirmed GitHub settings write); curation (the shared flag) is never touched. **The publish offer waits on the service being able to export rows** ([[DI-3]], spiked: not possible today); until then Share and Export WARN that the pack is unpublished | shareable-demo 09; PL-56c |
| D19 | Updates: the existing updater applies unchanged (fork sync per template repo + per-project template merge, one picker); no new mechanism for shared demos | shareable-demo 06 |
| D18 | Forget removes the card only; "Also delete my copy" is an unticked tick box naming the projects that still use the fork, confirmed again before the repo goes; project deletion never touches the fork | shareable-demo 04, 06 |

## Recommended design

**One resolver, one contract, one door.**

1. **The file format (program step 01).** A typed, schema-checked, versioned project file whose storefront
   slice is the same shape as a `demo-packages.json` storefront entry plus the package-level
   brand fields (name, description, icon, `configDefaults`, `configFlags`, `requiresMesh`,
   default block libraries). Three places it can live: our catalog, a colleague's repo, a
   project file. Names to settle in step 01; nothing is invented here.
2. **One lookup (feature step 01).** `resolveStorefrontForProject(project)` returns the project-stored
   storefront row when present, else the catalog row for `selectedPackage`/`selectedStack`.
   Every site in research §3b moves onto it. Pinned as a spine chokepoint. For shipped
   packages this is behaviour-preserving (the catalog still wins, so a package can still
   change what it patches between releases and existing projects follow).
3. **The card and dialog (feature steps 03–04).** A host-side probe handler (Pattern B) reads the repo once and
   returns a typed result; the Welcome step's plus card opens the existing dialog shell with
   two stages; Continue commits a synthesized package into wizard state and remembers the
   link.
4. **Create, then reset/update/edit/forget (feature steps 05–06).** The synthesized row rides the existing wire,
   the pipeline runs unchanged except `generate` → create-empty + fetch fallback, the row is
   persisted with the project, and the resolver makes reset, edit, republish, names and the
   update check work.
5. **The same actions for agents (07)**, **the how-to (08)**, **Share this demo (09)**.

### Alternatives considered

- Register colleague demos only in user settings (block-library pattern) — rejected alone:
  a project on a machine without the setting loses its package (P3). Kept as the
  "remember it" layer on top of per-project storage.
- Swap code+content under a shipped brand — rejected (D1): a colleague's repo need not match
  that brand's store codes, flags or ledger.
- Apply our patch ledgers to a colleague's repo, opt-in — deferred (D4): edits someone
  else's intended code; revisit if the dry-check reports show a pattern.

### Assumptions that would invalidate the design

- That `fstab.yaml`, `config.json` and the three canonical files are present in the repos
  colleagues actually share. If most shared repos are Demo Builder-generated, they are.
  Falsify: probe three real colleague repos in step 04's spike.
- That a headless (Next.js) repo can be recognised by its dependency list. Falsify against
  `skukla/citisignal-nextjs` in step 04.
- That the B2B drop-in package names are stable across the B2B boilerplate's history.
  Falsify against `adobe-commerce/boilerplate-b2b-template` at its LKG in step 04.
- That moving the eleven catalog lookups onto one resolver is behaviour-preserving for
  shipped packages. Falsify: the existing reset/rehydration/config-flag suites run unchanged
  in step 02.

## Slices, in order, with what each depends on

| Step | Slice | Depends on | Item |
|---|---|---|---|
| 01 | Define the project file format (`step-01-contract.md`) | — | PL-56a |
| — | The Shareable Demo feature: nine steps in its own plan, `../shareable-demo/overview.md` (look up a storefront in one place; rename Custom to Starter; read a colleague's repository; the Add a demo card and dialog; create from an added demo; reset, update, edit and forget; the same actions for agents; the how-to; Share this demo) | 01 | EDS-13a, 13b, 13c |
| later | Publishing a pack from an instance ([[DI-3]], spiked: the service cannot hand back rows today; not a gate on anything above) | — | DI-3, DI-1 |
| later | Team catalog | shareable-demo 04, 09 | EDS-13d |
| later | Export completeness, import parity, dead-code deletion, docs | 01 | PL-56 children |

The contract, the resolver and the Starter rename can start in parallel. The resolver is the
representative vertical slice: if the eleven sites fight it, the design is revised before
the probe is built.

## Dependencies outside the program

- [[DI-3]] (spiked 2026-09-11): exporting an instance's rows to the datapack service is not
  possible through the service's API today (the picker index carries names only; the export
  action reaches its store step and fails there; the item APIs are a working write path with
  nothing to feed them). Owner's call the same day: this is NOT a gate on the program. Share's
  "Publish it now?" (D32) warns until the service can export rows; EDS-13b no longer depends
  on it. The measurement is in `.rptc/research/data-installer/spike-di3-item-api-export-2026-09-11.md`.

## Reuse map

`reuse-map.md` beside this file maps every feature (A–P) to the existing code it is built
from and how (use as is / add to it / make it shared / build new). 108 rows: 48 use as is,
46 add to it, 7 make it shared; 18 genuinely new pieces named in its closing table; two generalisations flagged
as the risk. Owner's gate before development (2026-09-11).

## Verification

- Every step names its focused checks. The `gate` skill runs before any push.
- Feature step 01 proves itself by the existing suites not moving (behaviour-preserving).
- Feature steps 03–06 are driven in the Extension Dev Host against a real colleague repo, and
  the webview-visual-baseline is taken before and after step 04 on the wizard bundle.
- Feature step 07 is verified with `mcp-live-probe` against the running server.
- Reversal is exercised per step: forget a demo, delete a project, stop sharing.

## Rollback

Each step is its own commit on the branch; none changes on-disk project data except feature
step 05, which ADDS a field. A project created with the field loads on an older extension (unknown
manifest fields are ignored by `projectFileLoader`) but reset would refuse there; that is
the pre-existing behaviour for an unknown package, not a regression.

## Open, to settle as iteration continues

- Icon format for the description file (a path in the repo vs inline).
- The exact headless marker and B2B drop-in package names: verified against real repos in
  the "Read a colleague's repository" step, never written from memory.
- The gaps found in the 2026-09-11 plan review (feature plan, "Review findings").
