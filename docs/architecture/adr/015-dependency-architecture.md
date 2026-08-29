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
`buildDefault...Deps` file builds it — and those files, plus `extension.ts`,
are the only places that construct services.**

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

## Rejected alternatives

- **Locator everywhere** — entrenches the style that produced our measured
  test blind spots.
- **Injection everywhere (no boundary fetch)** — identical testability where
  it matters, bought with a 44-file migration and permanent double
  bookkeeping between entry points and the wiring; entry points hold no
  logic, so the extra purity protects nothing.
