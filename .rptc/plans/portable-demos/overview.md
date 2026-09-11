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
| D1 | A shared storefront is its own brand card, at the brand level, not a frontend swap | step 05, 06 |
| D2 | Paste a link; the PROJECT stores the synthesized storefront row; the link is remembered in the SC's user settings | step 05, 06, 07 |
| D3 | Edge Delivery and headless both; the probe tells which | step 04 |
| D4 | The colleague owns the storefront; we own the integration contract. Reset → the demo's source (the SC's fork by D16, else their `main`); no LKG pin, no patches, no brand assets. The five load-bearing code patches are dry-checked; each miss is a caveat | step 06, 07 |
| D5 | Copy their published content by default, skippable; probe the index before Continue | step 04, 05, 06 |
| D6 | Prefill exactly what shipped brands prefill: the three store codes, read from their `config.json` | step 04, 06 |
| D7 | B2B: detect from `config.json`, then the dependency list; only when both fail show a switch, off by default, with a plain reason; the answer is stored with the project and re-expressed on every regenerate | step 04, 05, 06, 07 |
| D8 | Words: plus card "Add a demo"; shipped "Custom (B2B + B2C)" → "Starter (B2B + B2C)"; "shared", "custom", "import", "from GitHub" rejected (research §9) | step 03, 05 |
| D9 | The door opens the Add Integration dialog shape; EVERY surface, pattern and word is an existing one (research §9a is the gate) | step 05 |
| D10 | A colleague may commit a description file: exactly what a shipped catalog entry may say; it wins over what we read, and we say what it overrode | step 01, 04 |
| D11 | "Share this demo" / "Stop sharing" writes that file from a project; template flag is an off-by-default tick box | step 10 |
| D12 | Team catalog after add and share ship | later |
| D13 | ONE contract: the versioned project file; the storefront description is the slice that travels with a repo | step 01 |
| D14 | Copy and Edit both stay, fed by that one complete file | PL-56 children |
| D15 | Agent surface ships with each human surface | step 08 |
| D16 | Fork on add, ticked by default: the SC's fork is the demo's source; updates are "Pull Jen's changes"; Forget offers to delete the fork | shareable-demo 04–07 |
| D17 | Source gone (unforked): dashboard notice, reset refuses up front, rename self-heal, "Change source" repoints via the Add dialog; content gone: reset offers to keep current content | shareable-demo 06 |

## Recommended design

**One resolver, one contract, one door.**

1. **Contract (step 01).** A typed, schema-checked, versioned project file whose storefront
   slice is the same shape as a `demo-packages.json` storefront entry plus the package-level
   brand fields (name, description, icon, `configDefaults`, `configFlags`, `requiresMesh`,
   default block libraries). Three places it can live: our catalog, a colleague's repo, a
   project file. Names to settle in step 01; nothing is invented here.
2. **Resolver (step 02).** `resolveStorefrontForProject(project)` returns the project-stored
   storefront row when present, else the catalog row for `selectedPackage`/`selectedStack`.
   Every site in research §3b moves onto it. Pinned as a spine chokepoint. For shipped
   packages this is behaviour-preserving (the catalog still wins, so a package can still
   change what it patches between releases and existing projects follow).
3. **Door (steps 04–05).** A host-side probe handler (Pattern B) reads the repo once and
   returns a typed result; the Welcome step's plus card opens the existing dialog shell with
   two stages; Continue commits a synthesized package into wizard state and remembers the
   link.
4. **Create and live with it (steps 06–07).** The synthesized row rides the existing wire,
   the pipeline runs unchanged except `generate` → create-empty + fetch fallback, the row is
   persisted with the project, and the resolver makes reset, edit, republish, names and the
   update check work.
5. **Agent surface (step 08)**, **publish the process (step 09)**, **Share (step 10)**.

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
| 01 | The contract: type, schema, names, migration rule (`step-01-contract.md`) | — | PL-56a |
| — | The Shareable Demo feature: nine steps in its own plan, `../shareable-demo/overview.md` (resolver, Starter rename, probe, door, create, live with it, agent surface, publish the process, Share) | 01 | EDS-13a, 13b, 13c |
| later | Team catalog | shareable-demo 04, 09 | EDS-13d |
| later | Export completeness, import parity, dead-code deletion, docs | 01 | PL-56 children |

The contract, the resolver and the Starter rename can start in parallel. The resolver is the
representative vertical slice: if the eleven sites fight it, the design is revised before
the probe is built.

## Verification

- Every step names its focused checks. The `gate` skill runs before any push.
- Step 02 proves itself by the existing suites not moving (behaviour-preserving refactor).
- Steps 04–07 are driven in the Extension Dev Host against a real colleague repo, and the
  webview-visual-baseline is taken before and after step 05 on the wizard bundle.
- Step 08 is verified with `mcp-live-probe` against the running server.
- Reversal is exercised per step: forget a demo, delete a project, stop sharing.

## Rollback

Each step is its own commit on the branch; none changes on-disk project data except step 06,
which ADDS a field. A project created with the field loads on an older extension (unknown
manifest fields are ignored by `projectFileLoader`) but reset would refuse there; that is
the pre-existing behaviour for an unknown package, not a regression.

## Open, to settle as iteration continues

- Step 01: the storefront description filename (not the project manifest's name) and the
  project file's extension; icon format.
- Step 04: exact headless marker; exact B2B drop-in package names (verify, do not invent).
- Step 05: whether added demos ALSO appear as their own cards under a row label, or only
  inside the dialog's stage 1 (research §9 assumed both; confirm).
- Step 10: where "Share" gets description text and icon.
- PL-56 children: the cut, and their order after step 01.
