# Architecture handbook

How this codebase is built, and how to write code that fits it.

Read it start to finish once. It builds: what the program is, how it is arranged, how
code inside it gets what it needs, and then the specifics — configuration, state, the
user interface, agents, tests.

Conventions appear as callouts where they apply, like this:

> **Convention.** Where a rule is stated, and what catches you if you break it.

This file describes how things are today. When something changes, change it here.

---

## 1. This is two programs

Start here, because everything else depends on it.

The extension runs in two places. **The host** is Node: it talks to VS Code, the file
system, and Adobe's APIs. **The webviews** are browser pages — eight of them, each a
separate React bundle with no access to Node or VS Code. They communicate by passing
messages.

Code does not move freely between them. A service that imports `vscode` cannot run in a
webview. A React component cannot read a file. The two halves have separate rules,
because a rule written for one is usually meaningless for the other.

> **Convention.** Host code follows [ADR-015](../architecture/adr/015-dependency-architecture.md).
> Webview code follows [ADR-017](../architecture/adr/017-webview-architecture.md).
> Enforced by `tests/sop/architecture-rules.test.ts` and
> `tests/sop/webview-architecture-rules.test.ts` — two enforcers, because two sets of rules.
> *Why:* one set of rules cannot fit both — a webview has no file system, a service has no DOM.

---

## 2. Code is grouped by what it does for the user

Within each half, code is arranged by feature, not by kind. Everything about Edge
Delivery storefronts lives in one folder: its services, its message handlers, its UI.

```
src/features/eds/            storefronts
src/features/prerequisites/  checking and installing tools
src/core/                    shared infrastructure — logging, state, shell, UI primitives
src/commands/                the entry points VS Code calls
```

A feature uses `core/`. A feature does not reach into another feature — if two features
need the same thing, it moves to `core/`. Commands are the exception: their job is to
orchestrate, so they may use any feature.

> **Convention.** Features do not import other features; commands may.
> [src/features/CLAUDE.md](../../src/features/CLAUDE.md) · enforced by eslint.
> *Why:* it keeps a feature replaceable. Cross-feature imports are how two features quietly become one.

> **Convention.** `@/core/*` and `@/types` are imported through their barrel file.
> Features are imported directly, and get no barrel.
> [ADR-022](../architecture/adr/022-barrel-files.md) · **not enforced.**
> *Why:* core is a shared surface worth curating; a feature barrel mostly makes cross-feature imports easy, which is the thing to discourage.

---

## 3. Code gets what it needs handed to it

That is the arrangement. This is the rule that keeps it working, and it is the one most
often broken.

**Fetch at the edges. Pass down. Build in one place.**

Four kinds of file may reach out and fetch a service: `extension.ts`, commands, handlers,
and MCP tool registrations. VS Code calls into these directly, so nothing can hand them
anything — they have to go and get it.

Below that line, a function receives what it needs as arguments. A service never fetches.
If a service needs three collaborators, its caller passes three collaborators. This is
also what makes the tests in section 9 possible: you can only hand in a fake if the code
accepts one.

Services are built in `extension.ts` or in a feature's `create...Deps` file. Section 5
covers the single exception.

> **Convention.** Services are fetched only at the boundary; below it, dependencies arrive
> as arguments. [ADR-015](../architecture/adr/015-dependency-architecture.md) · enforced by
> `tests/sop/architecture-rules.test.ts`.
> *Why:* a function that fetches its own dependencies cannot be tested without the whole world, and hides what it actually uses.

> **Convention.** A service takes one dependency bundle per feature. Plain data —
> configuration, identifiers, callbacks — arrives as ordinary arguments.
> [ADR-021](../architecture/adr/021-dependency-envelope.md) · **not enforced.**
> *Why:* six services once received the same collaborator six different ways, so none could be changed without touching all six.

### When to write a class

Rarely. There are around 1,350 exported functions here and 150 exported classes, and the
classes fall into four groups:

- **Commands** — VS Code expects an object with a lifecycle
- **Errors** — so failures can be caught by type
- **Things holding state between calls** — a cache, a registry, a queue
- **Infrastructure wrappers** — the command executor, the loggers

Everything else is a function. A class used only to group functions that share no state
should be functions.

> **Convention.** Commands extend `BaseCommand` or `BaseWebviewCommand`, which give them
> context, disposal and panel lifecycle. Enforced by `tests/sop/architecture-rules.test.ts`.
> *Why:* a command that acquires its own context and disposal is the implicit dependency this architecture removes everywhere else.

> **Convention.** Files in `src/types/` use `import type` only — a runtime import there
> pulls executable code into every module that wanted a shape. Enforced by
> `tests/sop/architecture-rules.test.ts`.
> *Why:* it keeps type files leaves. A runtime import there can form a cycle a type-only import never could.

---

## 4. Much of the behaviour is data, not code

Before writing a class, check whether the thing you want is a row in a file.

Twelve JSON registries define components, prerequisites, stacks, demo packages, block
libraries, wizard steps, API services and AI defaults. Each has a schema beside it. They
live in `src/features/*/config/`.

Adding a supported component or a new prerequisite is usually an edit to one of these,
not new code. The mechanism generally exists already and takes another entry.

> **Convention.** A registry edit matches the `*.schema.json` beside it. Enforced by the
> template suites under `tests/templates/`.
> *Why:* the registries are user-facing behaviour. A malformed entry fails at runtime, in someone's demo.

> **Where to start.** [component-system.md](../architecture/component-system.md) ·
> [prerequisites-system.md](../systems/prerequisites-system.md)

---

## 5. What survives between calls

Some things must outlive a single operation, and that is where this architecture has a
specific rule — because it was got wrong first.

Project state is persisted by `StateManager`, kept small and serializable. Webviews hold
view state in React and ask the host for anything real.

Caches are the interesting case. An authentication cache, the component registry,
prerequisite results — each must be built once and reused. If two parts of the code each
build their own, each gets a private cache and none of them helps. So there is exactly
one sanctioned exception to "build in one place": a **session accessor**, a small module
exposing `getX()` that builds on first call and returns the same instance afterwards,
plus `resetX()` so tests can start clean.

The matching trap is subtler. Anything that runs repeatedly — a context factory invoked
per message, say — must not build a stateful object, because then "cached" means "rebuilt
every time" and nothing tells you.

> **Convention.** A session accessor is the only construction site outside the root, and
> only for something whose state must outlive one call.
> [ADR-020](../architecture/adr/020-session-accessors.md) · tracked in the exemption ledger.
> *Why:* two instances mean two caches and neither is used. One instance is the entire benefit.

> **Convention.** Anything that runs repeatedly builds nothing stateful.
> [ADR-020](../architecture/adr/020-session-accessors.md) · enforced by
> `tests/sop/architecture-rules.test.ts`.
> *Why:* a cache rebuilt per message is not a cache, and nothing reports it — the code looks correct and the work is done twice.

> **Also relevant.** [state-ownership.md](../architecture/state-ownership.md) ·
> [state-management.md](../patterns/state-management.md)

---

## 6. The two halves talk by message

A webview sends a message; the host answers.

On the host side each feature keeps a **handler map** — message type to a function
returning `{ success, data?, error? }`. A handler translates one message into service
calls and returns the result. It does not render, and it holds no business logic of its
own.

The channel performs a handshake and queues anything sent before it is ready. An async
handler that is not awaited returns a promise to the webview, which will not be what you
meant.

> **Convention.** A handler translates and returns. It never renders.
> [ADR-015](../architecture/adr/015-dependency-architecture.md).
> *Why:* a handler that renders cannot be called by anything else — including an agent, which needs the same capability.

> **Convention.** Message shapes come from a typed file, never written from memory into a
> string or a `.mjs`. [CLAUDE.md](../../CLAUDE.md) · enforced by `npm run typecheck:tests`.
> *Why:* an invented shape typechecks and passes its tests while agreeing with nothing. It has cost this repo whole screens.

> **How to add one.** [webview-command-handler](../../.claude/skills/webview-command-handler/SKILL.md)

---

## 7. The user interface

Each of the eight webviews has one entry file. That entry mounts the app, reads the
initial data, and decides which stylesheets load — it is the only place that does. Below
it, components receive what they need as props.

**Business logic goes in hooks.** There are about 65 hooks to 110 components. A component
renders and handles interaction; a hook holds the state machine, the calls to the host,
and the derived data. When a component starts growing conditionals about what the data
*means*, that has become a hook's job.

The UI is Adobe Spectrum. CSS uses cascade layers — `reset`, `theme`, `overrides` —
declared in one place, with vendor styles below ours.

> **Convention.** The bundle entry is the composition root; dependencies arrive as props;
> hooks are the service layer. [ADR-017](../architecture/adr/017-webview-architecture.md) ·
> enforced by `tests/sop/webview-architecture-rules.test.ts`.
> *Why:* it puts the wiring in one readable place per surface, and keeps components testable without a running extension.

> **Convention.** Vendor CSS sits in the lowest layer. `!important` is not how you win a
> specificity argument. [ADR-018](../architecture/adr/018-css-architecture.md) ·
> **not enforced.**
> *Why:* layers settle specificity by declaration rather than by escalation, so nobody needs `!important` to win.

> **Read before your first component.** [ui-patterns.md](ui-patterns.md) ·
> [styling-guide.md](styling-guide.md) — Spectrum has specific traps.

---

## 8. Agents are a second door, never the only one

An AI agent reaches the extension through MCP tools, which call the same functions the
buttons call.

That is the point: a capability is not finished until a person can reach it without an
agent, through a command, a button, or something rendered. The agent path is the one that
silently disappears — a misconfigured server, a colleague who does not use Claude — so it
cannot be the only path. Agents gather evidence and compose reports; they do not apply
fixes on their own.

> **Convention.** Every capability has a human surface. MCP tools are additional.
> [ADR-012](../architecture/adr/012-diagnostic-surfaces.md) · measured by
> `.claude/skills/ai-coverage-scan`.
> *Why:* not everyone uses an agent, and the agent channel is the one that silently disappears.

> **How to add one.** [mcp-tool-authoring](../../.claude/skills/mcp-tool-authoring/SKILL.md) ·
> registration is pinned by `tests/features/ai/server/realSdkRegistration.test.ts`.

---

## 9. Tests

Around 15,400 tests across 1,200 files, mirroring the source layout.

Three kinds, chosen by what you are testing:

- **Unit** — the default. Hand the dependencies in as fakes and assert how they were
  called. Section 3 is what makes this possible.
- **Contract** — for anything crossing a network boundary. The fixture is captured from a
  real response, never written from memory.
- **Live** — journeys against the real thing, used sparingly.

Two things to know before you write one here. A fake cannot notice it was called wrongly,
so when the point is *how* a collaborator was used, assert the arguments rather than the
result. And coverage does not tell you a test would catch a bug: `npm run test:mutation`
breaks the code on purpose and reports what nothing noticed.

> **Convention.** The three tiers, and which applies.
> [ADR-016](../architecture/adr/016-test-strategy.md).
> *Why:* matching the test to the risk. A live test for pure logic is slow and flaky; a unit test for a network contract proves nothing.

> **Convention.** A split test family shares one `.testUtils` file, which owns the mocks
> and the subject import. [webview-test-authoring](../../.claude/skills/webview-test-authoring/SKILL.md) ·
> enforced by `tests/sop/test-family-setup.test.ts`.
> *Why:* the copies drift otherwise, and a spec that keeps its own copy can silently stop mocking anything.

> **Convention.** No test file over 750 lines.
> [test-file-splitting-playbook.md](../testing/test-file-splitting-playbook.md) · enforced by
> `npm run validate:test-file-sizes`.
> *Why:* past that nobody reads the whole file, so tests get duplicated rather than found.

> **Convention.** Never pipe jest through `tail`, `head` or `grep` — buffering makes a
> finished run look hung. Redirect with `> file 2>&1`. Never run two jest runs at once.
> Enforced by `.claude/hooks/rules/10-jest-pipe.rule` and
> `.claude/hooks/rules/15-jest-concurrent.rule`.
> *Why:* both mistakes report success. A pipe hides the exit code; two concurrent runs fail suites at random.

---

## 10. What stops this drifting

Conventions decay unless something checks them. Four layers do:

- **Hooks** stop a bad action as it happens — nine rules in `.claude/hooks/rules/`
- **Enforcer suites** fail the build when code drifts — nineteen in `tests/sop/`
- **Typecheck and lint** run over the whole repository in CI
- **Scans** measure at release cuts: duplication, dead code, cycles, agent coverage

Now look back through this document at the callouts marked **not enforced**. Those rules
depend on someone noticing in review, which means they will drift. That is a known gap
rather than an oversight, and closing one means either writing an enforcer or demoting
the rule to advice.

> **Convention.** Delete obsolete code. No deprecated stubs, no accepted-but-ignored
> options. [CLAUDE.md](../../CLAUDE.md) · measured by `.claude/skills/dead-code-scan`.
> *Why:* a deprecated stub still has to be read, understood and skipped by everyone who meets it.

> **Convention.** Secrets live in VS Code settings, never in code. This repository is
> public. [CLAUDE.md](../../CLAUDE.md) · GitGuardian scans every push.
> *Why:* git history is permanent and this repository is public.

> **Convention.** Commit to `develop`. Reach `master` only through a release.
> [cut-release](../../.claude/skills/cut-release/SKILL.md) · enforced by `.githooks/commit-msg`.
> *Why:* master is what ships to beta users automatically.

Every link in this file is checked by `tests/sop/handbook-links.test.ts`.

---

## Where the reasoning lives

This file says what to do, with one line on why each rule earns its place. It does not
carry the full argument, and that is deliberate — the two have different lifespans.

An **architecture decision record** explains why a choice was made and what was rejected.
It records one moment and is not edited afterwards; when a decision changes, a new record
supersedes it. The index is [docs/architecture/adr/README.md](../architecture/adr/README.md).

Reach for one when a rule here looks arbitrary and you are about to remove it. That is
what they are for. ADR-007 exists because the obvious way to encode a product URL
silently breaks every product page — the rule alone would not have told you that.
