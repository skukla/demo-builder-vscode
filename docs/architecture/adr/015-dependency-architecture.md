# ADR-015: Dependency architecture — fetch at the boundary, inject below, wire in the root

**Status:** Accepted (owner-ratified 2026-08-28, after the PL-12 pattern-conformance audit)
**Scope:** the EXTENSION HOST only — see below. The webview side is **ADR-017**.
**Enforced by:** `tests/sop/architecture-rules.test.ts` (build-failing, with a
reasoned exemption ledger)

## Scope: this ADR governs the extension host

Added 2026-08-29 (PL-17). This document was written from the host's evidence and
applied to the whole repo. It should not have been, because the two halves do not
share the mechanism this ADR is about.

|  | Extension host | Webviews |
|---|---|---|
| Runtime | Node, with the `vscode` API | browser bundles, no `vscode` API |
| Composition root | `src/extension.ts` | 8 bundle entries (`WEBVIEW_ENTRIES`) |
| How dependencies arrive | constructor / function arguments | React props |
| Shared-service lookup | a locator, confined to the boundary | impossible — different bundle |

The tell that the scope was wrong: this ADR mentions "webview", "browser",
"React" and "hook" **zero times**, and yet one of the six checks enforced under
its name was a pure React rule (custom-hook calls taking inline `[]`/`{}`
literals). It lived here because there was nowhere else to put it. It has moved
to ADR-017 along with its exemptions.

**So:** the rules below apply to `src/` EXCEPT webview code — `**/ui/**` and
`*.tsx`. That exclusion is implemented in the enforcement file, not left to
judgement.

This is a narrowing of jurisdiction, not a relaxation. The webview side is
governed by ADR-017, which is stricter in the places its runtime allows.

## Context

The PL-12 audit classified all 896 source files (ledger:
`.rptc/plans/pattern-conformance-audit/harness/`) and found ONE architectural
fault line: how code acquires shared services. 44 files fetch from
`ServiceLocator`, 49 construct services directly, and 17 mix both styles in a
single file. Every other measured pattern (handler shape 33/33, MCP response
envelope 28/28, UI-free services 32/33) holds — and the audit's central
lesson is WHY: the envelope is the one pattern a test fails on, and it is the
one pattern at 100% after having previously regrown by hand in 10 modules.
Consistency here is a property of enforcement, not intention.

The repo's own incident history drove the choice between styles: the four
silent production no-ops of 2026-08 all lived where dependencies were
implicit, and the argument-asserting tests that catch wrongly-shaped calls
are only possible where dependencies are handed in.

## Decision

**Services are fetched only at the framework boundary — `extension.ts`,
`commands/` files, `handlers/` files, and MCP tool-registration files.
Everywhere else, what a function or class needs arrives as parameters. When
logic needs a bundle of services, the feature's `create...Deps` /
`buildDefault...Deps` file builds it.**

**Construction: `extension.ts` and `create...Deps` files are where services are
built. ENFORCED for any class that accumulates state after construction; GUIDANCE
for the rest** (amended 2026-08-29 — see the amendment below for the measurement
that split those two).

That split is stated rather than blurred, because this repo keeps paying for the
other thing. A sentence saying "the only places that construct services" reads as
law; the enforcer checks stateful classes. Both are useful and they are not the
same, so the reader is told which is which. Where the guidance is unenforced,
nothing fails — that is the trade the amendment makes, with its cost named.

This is not an invented arrangement; it is the composition of three named,
documented patterns:

- **Dependency Injection** — dependencies as parameters/constructor args
  (Fowler, *Inversion of Control Containers and the Dependency Injection
  pattern*, 2004: https://martinfowler.com/articles/injection.html).
- **Composition Root** — one place near startup where the object graph is
  wired (Seemann, *Dependency Injection in .NET*, 2011). Ours is
  `extension.ts`'s activation.
- **Service Locator, confined** — the global lookup is the documented
  anti-pattern for LOGIC (hidden dependencies, untestable seams — the same
  two failures we measured locally), but resolving at a framework boundary
  the host controls is standard practice in plugin environments: VS Code
  invokes our commands/handlers/tools directly and cannot constructor-inject
  into them.

### Responsibility contracts (what each kind of file IS)

| Kind | Contract |
|---|---|
| Command | Receives a user gesture; orchestrates; holds no business logic. May fetch. |
| Handler | Translates one message into service calls; RETURNS its result; never renders UI. May fetch. |
| MCP tool | Agent door to a capability; standard envelope; destructive ⇒ consent. May fetch. |
| Service | Owns a capability; the only layer doing I/O; needs arrive as parameters; never fetches, never shows UI. |
| `create...Deps` | Assembles one feature's service bundle; the only construction site outside `extension.ts`. |
| Accessor | Answers a question from existing data; NEVER writes (the `ensureOAuthCredentialId` lesson). |

### Two rules the enforcer checks that this document did not state

Found 2026-08-29 while asking whether this ADR should be split in two. Five
checks run under its name; the text mentioned `fetch` 10 times and `construct`
17, and these two **zero** times. They were enforced under a document that never
ruled on them — the same law/enforcement gap this ADR's Consequences section
records, pointing the other way. Written down rather than spun into a second ADR:
both are about how a dependency edge is allowed to form, which is this document's
subject.

**Commands extend `BaseCommand` or `BaseWebviewCommand`.** A command class under
`commands/` gets its context, disposal and panel lifecycle from the base. A class
that does not extend one has to acquire those itself — which is the implicit
dependency this ADR exists to remove, and it is how a command ends up reaching
for things the base would have handed it. Ledger: `commandBase`.

**Files under `src/types/` (and `*.types.ts`) use `import type` only.** A types
file with a runtime import stops being a leaf: it pulls executable code into
every module that wanted only a shape, and it can form a cycle a type-only import
never could. The rule is mechanical — a bare `import` in a types file is a
violation, `import type` is not. Ledger: `typesPurity`.

### The "when you want to…" table

The full 11-row placement table lives in
`docs/architecture/where-code-goes.md` — the same table appears in the
contributor docs and drives the enforcement test, so law, map, and teeth
cannot drift apart.

## Consequences

- The style-mixing files converge to this ruling — each carries an exemption row
  until cleaned. **This became true on 2026-08-29; when first written it was an
  intention stated as a mechanism.** The construction-boundary predicate had been
  implemented as "anywhere fetching is allowed, plus deps builders", so every
  command, handler and MCP registrar could construct freely — precisely what the
  mixing files were doing, so none of them could ever appear in the ledger. The
  pattern-conformance audit still measured them (14 mixers at the time) and the
  gap showed as ZERO overlap between the audit's deviations and the ledger.
  Tightening the predicate to this document's own words — `extension.ts` and
  `create...Deps` only — took the ledger from 31 rows to 55 and put all 14 in it.
  The lesson is the one this repo keeps paying for: a document describing what
  code does is a claim, and only the enforcer makes it true.
- New violations fail CI with the offending path in the failure message.
- Exemptions are possible but never silent: each is a named entry with a
  written reason in the test's ledger — the same named-floor discipline the
  battery uses.
- The locator itself remains (the boundary needs it); what dies is locator
  use inside logic.

## Amendment 2026-08-29 — the construction rule asks about STATE, not location

**What changed.** "Construct only in `extension.ts` and `create...Deps`" is now
enforced only for classes that ACCUMULATE STATE after construction. A stateless
class may be built where it is used.

**Why.** The location rule was a proxy, and measuring it against its own ledger
showed what it was standing in for. Of 47 rows: 15 built a stateful class
(rebuilding drops a cache — real), 13 were stateless but module-mocked by ten or
more suites (a TEST-design cost, now recorded in ADR-016), and **19 protected
nothing at all**.

It also mis-fired on its largest cluster. `HelixService` held 13 of the 47 rows.
It is stateless — its credentials arrive at construction and are never mutated —
and the missing-credential hazard that made it look urgent had been fixed on
2026-08-15 by registering one DA.live token source at activation (`cbcb927db`).
Two rounds of design were spent ruling that out. A rule aimed at state would have
stayed silent, correctly.

**The detector**, in `tests/sop/architectureScan.ts`: a field written outside the
constructor, OR a container field (`Map`/`Set`/array) mutated in a method. Both
conditions are needed — a `this.x =` scan alone misses `PrerequisitesCacheManager`,
which mutates a `Map` it never reassigns.

**Validated against the three cases learned at cost.** It flags
`GitHubTokenService` (`validationCache` — the D-2 finding, 13 files re-validating
tokens against GitHub) and `ComponentRegistryManager` (`transformedRegistry`), and
does not flag `HelixService`. Three for three, pinned as this rule's CONTROL test.

**What this GIVES UP, stated plainly.** Before the amendment, ANY service
constructed outside the two allowed places failed the build. Now a stateless one
does not. Concretely, 32 ledger rows stopped being enforced:

- **19** protected nothing measurable — that is the intended saving.
- **13** are a real cost, just not this ADR's: a stateless class that ten or more
  suites module-mock. Those moved to ADR-016 as a MEASURE, and a measure is
  weaker than a check — nothing fails if a new one appears. `HelixService` alone
  accounts for 8 of the 13, at 26 suites. If that list grows rather than shrinks,
  the honest response is to give ADR-016 a real check, not to widen this one back.

**What did not change.** The fetch boundary, the composition root, and
dependencies-arrive-as-parameters all stand. This narrows one enforcement, not the
architecture: `create...Deps` is still where a feature's bundle is assembled, and
building a stateless collaborator inline was never the thing that hurt.

Research: `.rptc/research/construction-boundary-is-the-wrong-question/`.

## Rejected alternatives

- **Locator everywhere** — entrenches the style that produced our measured
  test blind spots.
- **Injection everywhere (no boundary fetch)** — identical testability where
  it matters, bought with a 44-file migration and permanent double
  bookkeeping between entry points and the wiring; entry points hold no
  logic, so the extra purity protects nothing.
