# Documentation

Nine kinds of document, each with one job. **Where a thing belongs follows from what
kind of thing it is** — and until 2026-08-30 that was never written down, which is
how one rule ended up stated in three places and another (`Pattern B`) in none.

| Kind | Job | Where | The test |
|---|---|---|---|
| **Session context** | What an agent needs *before* it knows where it is going: invariants, vocabulary, routing | [`../CLAUDE.md`](../CLAUDE.md) | Loaded every session, so every line costs |
| **Directory context** | What is in this directory, and traps you cannot infer from the source | `*/CLAUDE.md` | Only useful once you are already there |
| **The law** | Every convention, each naming its enforcer | [`development/handbook.md`](development/handbook.md) | Would a violation fail the build? |
| **Judgement** | What an enforcer cannot encode: where the line is, what good looks like | [`development/sop/`](development/sop/) | The rule exists; this is the taste |
| **Decisions** | Why it went this way, and what was rejected | [`architecture/adr/`](architecture/adr/) | Is there a rejected alternative worth recording? |
| **Subsystems** | How one part actually works | [`systems/`](systems/) | Reference you read, not steps you run |
| **Procedures** | Ordered steps somebody executes | `.claude/skills/` | Invoked, never transcribed |
| **Entry points** | Getting one audience started | [`../CONTRIBUTING.md`](../CONTRIBUTING.md), [`../tests/README.md`](../tests/README.md) | Who is this for? |
| **Records** | What happened, dated | `.rptc/`, [`CHANGELOG.md`](CHANGELOG.md), [`research/`](research/) | Describes a moment, not the present |

Two of those distinctions are load-bearing and easy to lose:

- **A rule, its judgement, and its procedure are three documents.** The 750-line
  build limit is a convention; deciding whether a 400-line file is doing three jobs
  is judgement; splitting it is a skill. Collapsing them is how a skill grows a
  duplicate copy of a rule that then drifts.
- **A record is not documentation.** A dated finding describes the world on that
  day and is allowed to be wrong now. Anything in the top eight rows describes the
  world *today* and is not.

## Every area has ONE front door

The nine kinds answer *where does this statement live*. They do not answer *I am
about to work on X — where do I start*, and they cannot: this table scatters every
substantial subject by design. Measured 2026-08-30, each major area of this codebase
spans **four to seven** of the nine kinds. Being scattered is the normal condition
here, not a defect to route around.

What makes an area findable anyway is a **front door**: one document you land on that
says what the area is and sends you to the kinds. Four of the five areas already have
one, which is why this is a rule discovered rather than invented:

| Area | Front door |
|---|---|
| Testing | [`../tests/README.md`](../tests/README.md) |
| Extension host | [`../src/CLAUDE.md`](../src/CLAUDE.md) |
| Agents / MCP | [`systems/mcp-server.md`](systems/mcp-server.md) |
| EDS / storefront | [`../src/features/eds/README.md`](../src/features/eds/README.md) |
| Frontend / webviews | [`../src/core/ui/CLAUDE.md`](../src/core/ui/CLAUDE.md) |

**One, and exactly one.** A second front door for an area is two things to keep
correct, which is the drift this whole structure exists to prevent. A front door
ROUTES and does not restate — the moment it explains a rule instead of pointing at
the handbook entry, it has become a duplicate copy with nothing keeping it honest.

The frontend row was **missing until 2026-08-30**, and it is worth saying why the gap
survived: the frontend is not under-documented — 16 conventions in the handbook, 14 of
them enforced, two ratified ADRs and four skills. It was the best-covered area in the
repo and the only one you could not find your way into, because `src/core/ui/` held
`components/`, `hooks/`, `styles/` and `utils/` with nothing above them. Coverage and
findability are different properties, and only one of them was being checked.

Enforced by `tests/sop/doc-module-refs.test.ts` — each area's front door must exist.

## The law

- **[development/handbook.md](development/handbook.md)** — every convention, with
  its enforcer. Read it once, start to finish.
- **[development/conventions.md](development/conventions.md)** — the same set as an
  index. **Generated** by `npm run docs:conventions`; do not edit.

## Judgement the enforcers cannot encode

- [development/sop/code-patterns.md](development/sop/code-patterns.md) — when an
  expression earns a name; when a style object is right
- [development/sop/god-file-decomposition.md](development/sop/god-file-decomposition.md)
  — is it actually a god file, and which of four shapes applies
- [development/sop/consistency-patterns.md](development/sop/consistency-patterns.md)
  — the seams where doing one job two ways causes real bugs
- [development/sop/testing-guide.md](development/sop/testing-guide.md) — the two
  project-specific test traps
- [development/styling-guide.md](development/styling-guide.md) — the practical half
  of CSS; [ADR-018](architecture/adr/018-css-architecture.md) is the architecture

## Architecture

- **[architecture/adr/README.md](architecture/adr/README.md)** — the decision
  records. **Generated**; every column measured from the files.
- **[architecture/CLAUDE.md](architecture/CLAUDE.md)** — the index of architecture
  documents, including [where-code-goes.md](architecture/where-code-goes.md), which
  answers "I want to add X — what do I write and where".
- [architecture/overview.md](architecture/overview.md) — start here if the system is
  new to you.

## Subsystems

- **[systems/mcp-server.md](systems/mcp-server.md)** — how agents drive the
  extension. Start here for anything MCP; it assumes no prior knowledge.
- [systems/mcp-tools.md](systems/mcp-tools.md) — the tool catalogue. **Generated**
  by `npm run docs:tools`.
- [systems/agent-alerts.md](systems/agent-alerts.md) ·
  [systems/data-installer.md](systems/data-installer.md) ·
  [systems/prerequisites-system.md](systems/prerequisites-system.md) ·
  [systems/custom-block-libraries.md](systems/custom-block-libraries.md)
- [systems/logging-system.md](systems/logging-system.md) ·
  [systems/error-logging.md](systems/error-logging.md) ·
  [systems/debugging.md](systems/debugging.md) ·
  [systems/race-conditions.md](systems/race-conditions.md) ·
  [systems/webview-loading.md](systems/webview-loading.md)

## Patterns — a shape you apply, not a rule you obey

- [patterns/selection-pattern.md](patterns/selection-pattern.md) — a selection
  changes local state; only Continue talks to the backend
- [patterns/state-management.md](patterns/state-management.md) — the five places
  state can live, and how it ends up in two of them
- [patterns/resource-disposal.md](patterns/resource-disposal.md) — why a leak
  presents as a handler running twice rather than as a leak

## Testing

- **[../tests/README.md](../tests/README.md)** — organisation, running, and what a
  test must actually constrain
- [testing/test-file-splitting-playbook.md](testing/test-file-splitting-playbook.md)
  · [testing/jest-force-exit.md](testing/jest-force-exit.md)

## When something breaks

- [troubleshooting/cleanup.md](troubleshooting/cleanup.md) — removing projects
  without orphaning their cloud resources
- [troubleshooting/adobe-cli-timeouts.md](troubleshooting/adobe-cli-timeouts.md) —
  a slow `aio` call is not a failed one
- [build.md](build.md) — building and running from source

## Writing a new document

**First decide which of the nine kinds it is.** If it is a rule, it belongs in the
handbook with an enforcer, not in a new file. If it is a procedure, it is a skill.
If it describes a moment, it is a record and belongs in `.rptc/`.

Then: name it for its subject in lowercase-hyphenated form, link it from here, and
write only what a reader cannot get from the code. This index used to prescribe a
section template — Overview, Architecture, Implementation, Examples, API Reference,
Best Practices, Troubleshooting — and every document that followed it grew generic
Performance and Security sections that said nothing about this codebase. There is
no template. Say the thing and stop.

A test checks that every document under `docs/` appears here, because this index
listed 18 of 41 for a long time — including the handbook.
