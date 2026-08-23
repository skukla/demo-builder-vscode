# EDS has no contract drift checker, and it is the largest external-contract exposure here

> ## CLOSED 2026-08-23 — shipped as `npm run eds:drift`
>
> `scripts/edsDrift.js` over a shared core (`scripts/lib/driftCore.js`,
> extracted from the Data Installer checker with its 33 tests untouched — the
> four paid-for rules now live once). Pins the four contracts that already
> bit: Helix status (two-level outer/inner semantics), Config Service site
> entry (keyed on the REPO, pinned by test) + org roster, DA.live SITE-scope
> config, and the aem.live percent-encoding rejection as a behavioural probe
> with a root-200 control that INVALIDATES the run rather than reporting an
> unreadable verdict. `--capture` bootstraps fixtures (review before commit —
> public repo; the fixtures README says what to redact). Wired into
> `cut-release`'s advisory block with the not-a-CI-gate reasoning written
> next to it. The three ad-hoc `scripts/test-*` probes are retired (deleted;
> ADR-002's citations annotated). Fixtures not yet captured — first
> `--capture` run needs a real storefront's credentials; until then every
> check FAILS loudly by design.

## Provenance

Raised 2026-08-13 by the Data Installer session, routed here because EDS is shared territory.
The prompting question was whether the drift checker built for the Data Installer is
data-installer-only. It is — so who else carries the same risk?

Every number below was re-measured independently on `develop` before filing, not taken on
trust. All of them reproduced.

## The exposure

Files under `src/features/*/services/` making external HTTP calls (`fetch(` / `axios` /
a literal `https://`):

| Feature | Files | Drift guard |
|---|---|---|
| **eds** | **36** | fixtures exist, no checker |
| updates | 5 | none |
| project-creation | 3 | none |
| mesh | 3 | none |
| components | 2 | none |
| authentication | 2 | none |
| app-builder | 2 | none |

EDS talks to **Helix Admin, DA.live, the AEM Config Service and GitHub** with offline-only
tests. Every one of those contracts can move and the suite stays green.

`tests/fixtures/eds/` exists but only **2 test files** read it. The three ad-hoc probes in
`scripts/` (`test-bulk-helix-api.ts`, `test-helix-publish.ts`, `test-fstab-codesync-timing.ts`)
contain **zero** references to a fixture — they hit live services and print, so none of them
would notice a shape change.

This is not theoretical for EDS specifically. The Helix DELETE-auth rule, the Config Service
lookup key, the DA.live site-vs-org config scope and the aem.live path-encoding limit are all
behaviours discovered by breakage and recorded in memory. Each is a contract that could move
again without a single test failing.

## Reference implementation

`scripts/dataInstallerDrift.js` + `tests/scripts/dataInstallerDrift.test.ts`. Four rules in it
are load-bearing, and each was paid for:

1. **A non-200, transport error or unparseable body is a FAILURE, never "no drift".** A checker
   that can report clean when it never reached the service manufactures confidence and is worse
   than nothing.
2. **ADDED keys are not drift.** Parsers ignore unknown fields by design; reporting additive
   change makes it cry wolf, and a tool that cries wolf gets switched off.
3. **Coverage is action × parameter, not action.** A plan enumerated every action name, decided
   each, and still missed one — because it was a parameter VALUE on an action already ticked
   off. Any request field with a fixed value set needs its values enumerated and each decided.
4. **A nonsense control runs alongside the real inputs, and if it passes the run is invalidated
   rather than reported.** An unknown mode answered 200 with an empty list rather than 400, so
   the signal was the count; without the control, seven guesses would have read as seven
   capabilities.

It also documents a deliberate blind spot worth copying: a null on either side carries no shape
information, so a field going permanently null is invisible. That trade exists because the
first live run cried drift on three fields whose contract had not moved — the false positive
that gets a checker deleted.

## Scope

**EDS only.** Its blast radius is what justifies the work; the other five unguarded features
are better served by the pattern existing than by six half-maintained scripts. Revisit after
EDS has run for a while.

## The constraint that decides its shape

**This cannot be a CI gate.** The Data Installer checker needs an interactive `aio` IMS token,
so it structurally cannot run in CI. Everything EDS needs — Helix API key, DA.live IMS token,
GitHub token — has the same property.

So it is a **manual pre-release check**, run by a person who is already looking. Say that
plainly wherever it is wired, or someone will try to make it a gate, watch it fail on missing
credentials, and disable it.

`cut-release` is the natural home, alongside `npm run data-installer:drift` in the advisory
block that explicitly never blocks the tag.

## Execution plan

1. **Pick the contracts worth pinning first.** 36 files is not 36 checks. Start with the four
   that have already bitten: Helix DELETE auth, Config Service site lookup, DA.live site config
   scope, aem.live path encoding.
2. **Capture fixtures from live responses** for those reads, into `tests/fixtures/eds/`.
3. **Port the four rules above verbatim.** They are not stylistic; each was learned from a
   specific failure.
4. **Reads only.** The Data Installer checker probes read endpoints deliberately. EDS writes
   (publish, unpublish, repo create, content copy) mutate customer-visible state and must stay
   out.
5. **Add it to `cut-release`'s advisory block**, with the not-a-gate reasoning written next to it.
6. **Retire or convert the three ad-hoc `scripts/test-*` probes.** They hit live services and
   compare against nothing; leaving them beside a real checker invites someone to trust them.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-13-eds-contract-drift-checker.md`, then read
> `scripts/dataInstallerDrift.js` before writing anything — its four rules are the item, and
> each was paid for. Start with the four EDS contracts that have already broken in production
> rather than trying to cover 36 files. Reads only; EDS writes mutate customer-visible state.
> And it is a manual pre-release check, not a CI gate — the credentials make that structural.
