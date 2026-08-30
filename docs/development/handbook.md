# Architecture handbook

How this codebase is built, and how to write code that fits it.

Read it start to finish once. It builds: what the program is, how it is arranged, how
code inside it gets what it needs, and then the specifics — configuration, state, the
user interface, agents, tests.

Conventions appear as callouts where they apply, like this:

> **Convention.** The rule itself.
> *Why:* one line on what it buys you.
> Where it is stated · and what catches you if you break it.

This file describes how things are today. When something changes, change it here.

---

## 1. This is two programs

**Position.** One repository, two programs, two sets of rules. Code does not cross between
them; anything shared has to be written to run in both.

Start here, because everything else depends on it.

The extension runs in two places. **The host** is Node: it talks to VS Code, the file
system, and Adobe's APIs. **The webviews** are browser pages — eight of them, each a
separate React bundle with no access to Node or VS Code. They communicate by passing
messages.

Code does not move freely between them. A service that imports `vscode` cannot run in a
webview. A React component cannot read a file. The two halves have separate rules,
because a rule written for one is usually meaningless for the other.

> **Convention.** Host code follows the dependency rules for the extension host.
> *Why:* a service has no DOM and can reach the file system; its rules are about what it may
> fetch. [ADR-015](../architecture/adr/015-dependency-architecture.md) ·
> Enforced by `tests/sop/architecture-rules.test.ts`.

> **Convention.** Webview code follows the webview rules.
> *Why:* a webview has no file system and no VS Code API; its rules are about composition and
> what crosses the message boundary.
> [ADR-017](../architecture/adr/017-webview-architecture.md) ·
> Enforced by `tests/sop/webview-architecture-rules.test.ts`.

---

## 2. Code is grouped by what it does for the user

**Position.** Grouped by feature, not by kind. A feature owns its whole vertical slice and
does not reach into its neighbours; anything two features need moves to `core/`.

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
> [ADR-022](../architecture/adr/022-barrel-files.md) · Enforced by the `featureBarrels`
> ledger in `tests/sop/architecture-rules.exemptions.json` — five predate the rule and the
> set may only shrink.
> *Why:* core is a shared surface worth curating; a feature barrel mostly makes cross-feature imports easy, which is the thing to discourage.

---

## 3. Code gets what it needs handed to it

**Position.** Functional by default — roughly nine functions for every class. Dependencies
are handed in rather than fetched, except at the four edges the platform calls into.

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
> [ADR-021](../architecture/adr/021-dependency-envelope.md) · Enforced by
> `tests/sop/architecture-rules.test.ts` — no signature takes two dependency bundles.
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

> **Convention.** Never pass an argument as `any` or `never`. If a cast is needed to
> make a call compile, the shape is wrong — build the object the callee declares.
> *Why:* a cast in argument position switches off the one check that catches a caller
> and callee disagreeing. Four times it hid a field the callee dispatches on, and each
> time the result was a silent no-op in production that twelve tests agreed with.
> Enforced by `tests/sop/architecture-rules.test.ts`.

> **Convention.** A shape that crosses a boundary — a message, a payload, a fixture —
> lives in a typechecked file and is typed to the real interface.
> *Why:* a literal in a `.mjs`, a `.json` or a template string has opted out of the only
> check that works, and an invented shape still parses and still passes review. Five were
> invented in one afternoon; each had an exported type that would have refused to compile.
> [tests/helpers/webviewFixtures.ts](../../tests/helpers/webviewFixtures.ts) is the worked
> example · enforced by `npm run typecheck:tests` in CI for anything under `tests/`.

> **Convention.** A comment describing what ANOTHER module does must cite the code that
> makes it true. If you cannot cite it, write what you verified instead.
> *Why:* nothing keeps such a comment true — not the compiler, not the tests — and it reads
> to the next person as verified fact. Two comments once asserted a scheduled re-registration
> that did not exist; they were false the day they were written, and they suppressed the
> question that would have found a shipped bug. **Not enforced** — no check can read intent.

---

#### Also checked here

Enforced automatically. You do not need to hold these in your head — if you break one, the
check says so and names the file.

> **Convention.** Time values come from the shared `TIMEOUTS` constants, never a literal.
> *Why:* a bare `5000` says nothing about which timeout it is or why that length.
> [sop/code-patterns.md](sop/code-patterns.md) for the constants and how to add one ·
> enforced by `tests/sop/magic-timeouts.test.ts`.

> **Convention.** Sleeps route through the shared `sleep()`.
> *Why:* a hand-rolled sleep cannot be faked, so it makes tests slow and flaky.
> Enforced by `tests/sop/no-bare-sleep.test.ts`.

> **Convention.** A complex inline expression becomes a named function.
> *Why:* the name is the explanation. Without it every reader re-derives the intent.
> [sop/code-patterns.md](sop/code-patterns.md) for where the line is ·
> enforced by `tests/sop/complex-expressions.test.ts`.

> **Convention.** A file stays under 500 lines; 750 fails the build. Past that it is
> doing more than one job — split it by responsibility, not by line count.
> *Why:* nobody holds a 700-line file in their head, so changes get made in the part
> that is understood and the rest quietly rots.
> [sop/god-file-decomposition.md](sop/god-file-decomposition.md) for how to split ·
> enforced by `max-lines` in `eslint.config.mjs` (warns at 500) and
> `scripts/check-test-file-sizes.js` (fails CI at 750).

## 4. Much of the behaviour is data, not code

**Position.** Prefer a row in a registry to a new class. Twelve schema-backed JSON files
describe what the extension supports, and most additions are edits to them.

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

#### Also checked here

Enforced automatically. You do not need to hold these in your head — if you break one, the
check says so and names the file.

> **Convention.** A credential environment variable is registered as a secret.
> *Why:* an unregistered one is written in the clear and read back by anything.
> Enforced by `tests/sop/credential-env-vars-registered.test.ts`.

> **Convention.** A setting that receives credentials is scoped to the user, never the
> workspace.
> *Why:* a workspace-scoped credential setting gets committed by someone eventually, and
> this repository is public.
> Enforced by `tests/sop/credential-sink-settings-scoped.test.ts`.

## 5. What survives between calls

**Position.** Anything cached exists once per session, is built on first use, and can be
reset. Nothing stateful is built by code that runs repeatedly.

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
> [ADR-020](../architecture/adr/020-session-accessors.md) · Enforced by the exemption ledger
> in `tests/sop/architecture-rules.exemptions.json`.
> *Why:* two instances mean two caches and neither is used. One instance is the entire benefit.

> **Convention.** Anything that runs repeatedly builds nothing stateful.
> [ADR-020](../architecture/adr/020-session-accessors.md) · enforced by
> `tests/sop/architecture-rules.test.ts`.
> *Why:* a cache rebuilt per message is not a cache, and nothing reports it — the code looks correct and the work is done twice.

> **Also relevant.** [state-ownership.md](../architecture/state-ownership.md) ·
> [state-management.md](../patterns/state-management.md)

---

## 6. The two halves talk by message

**Position.** The webview asks, the host answers. Handlers translate a message into service
calls and return a result — they hold no logic and render nothing.

A webview sends a message; the host answers.

On the host side each feature keeps a **handler map** — message type to a function
returning `{ success, data?, error? }`. A handler translates one message into service
calls and returns the result. It does not render, and it holds no business logic of its
own.

The channel performs a handshake and queues anything sent before it is ready. An async
handler that is not awaited returns a promise to the webview, which will not be what you
meant.

> **Convention.** A handler translates and returns. It never renders.
> [ADR-015](../architecture/adr/015-dependency-architecture.md) · Enforced by
> `tests/sop/architecture-rules.test.ts` — no handler imports React.
> *Why:* a handler that renders cannot be called by anything else — including an agent, which needs the same capability.

> **Convention.** Message shapes come from a typed file, never written from memory into a
> string or a `.mjs`. [CLAUDE.md](../../CLAUDE.md) · enforced by `npm run typecheck:tests`.
> *Why:* an invented shape typechecks and passes its tests while agreeing with nothing. It has cost this repo whole screens.

> **How to add one.** [webview-command-handler](../../.claude/skills/webview-command-handler/SKILL.md)

---

## 7. The user interface

**Position.** One composition root per surface. Logic lives in hooks, rendering in
components, and styling in cascade layers rather than in specificity fights.

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

> **Convention.** Vendor CSS sits in the lowest cascade layer.
> *Why:* layers settle specificity by declaration order rather than by escalation, so
> nothing downstream has to out-shout the vendor.
> [ADR-018](../architecture/adr/018-css-architecture.md) · **Not enforced — and not yet
> true.** No `@layer vendor` exists in `src/` today. This is the one rule here the code
> does not already follow; it waits on the CSS migration (PL-21), which is not authorised.

> **Convention.** `!important` is not how you win a specificity argument. The count may
> not grow.
> *Why:* it is the escalation the layers exist to make unnecessary, and each one makes the
> next harder to avoid. Migrating the existing 1,969 is not authorised yet, so the rule is
> a ratchet rather than a ban.
> [ADR-018](../architecture/adr/018-css-architecture.md) · Enforced by the
> `importantCeiling` pin in `tests/sop/stylesheet-bundles.test.ts`.

> **Read before your first component.** [ui-patterns.md](ui-patterns.md) ·
> [styling-guide.md](styling-guide.md) — Spectrum has specific traps.

---

> **Convention.** Hooks are the webview's service layer. A component renders and handles
> interaction; the state machine, the calls to the host and the derived data live in a hook.
> *Why:* it is what makes a component testable without a running extension, and it stops
> render code growing opinions about what the data means.
> [ADR-017](../architecture/adr/017-webview-architecture.md) · Enforced by the `hookRefs`
> ledger in `tests/sop/webview-architecture-rules.exemptions.json`.

> **Convention.** One message channel per bundle, and it is a singleton.
> *Why:* `acquireVsCodeApi()` can only be called once per webview, so there is nothing to
> vary. A second channel is not a design choice, it is a bug waiting for a race.
> [ADR-017](../architecture/adr/017-webview-architecture.md) · Enforced by the
> `messageChannelOwners` ledger in `tests/sop/webview-architecture-rules.exemptions.json`.

> **Convention.** A CSS class a component uses is defined somewhere.
> *Why:* an undefined class fails silently — the element simply renders unstyled, on one
> surface, with no error anywhere.
> [ADR-018](../architecture/adr/018-css-architecture.md) · Enforced by the
> `classesDefinedNowhere` ledger in `tests/sop/stylesheet-bundles.test.ts`.

> **Convention.** A class used by shared components lives in a globally-loaded sheet, not
> in one bundle's stylesheet.
> *Why:* a shared component appears on several surfaces; a class defined in one bundle
> styles it on that surface and nowhere else.
> [ADR-018](../architecture/adr/018-css-architecture.md) · Enforced by the cross-bundle
> check in `tests/sop/stylesheet-bundles.test.ts`.

#### Also checked here

Enforced automatically. You do not need to hold these in your head — if you break one, the
check says so and names the file.

> **Convention.** No inline styles.
> *Why:* they escape the cascade layers, so they cannot be themed or overridden.
> Enforced by `tests/sop/inline-styles.test.ts`.

> **Convention.** Markup repeated in three or more places becomes a component.
> *Why:* three is where copies start drifting apart instead of being found.
> Enforced by `tests/sop/component-extraction.test.ts`.

> **Convention.** Modals are hosted in one place, not mounted wherever they are opened.
> *Why:* ad-hoc mounting produces stacking and focus bugs that only appear in combination.
> Enforced by `tests/sop/modal-hosting.test.ts`.

> **Convention.** A CSS class used in a bundle is styled by that bundle.
> *Why:* a stylesheet only reaches bundles whose entry imports it, so a class can be styled
> on one surface and silently bare on the next, with no error anywhere.
> Enforced by `tests/sop/stylesheet-bundles.test.ts`.

> **Convention.** Before writing a new UI component, check whether the shared vocabulary
> already has it.
> *Why:* this codebase has repeatedly grown a second version of a component that already
> existed.
> Enforced by `.claude/hooks/rules/30-reuse-first.rule`, which interrupts at the moment you
> create the file.

> **Convention.** A component's own style block styles that component only.
> *Why:* a component that reaches out to style its neighbours makes both un-moveable, and
> the styling then depends on where the definer happens to be mounted.
> [ADR-018](../architecture/adr/018-css-architecture.md) · Enforced by the
> `styleBlockLeaks` ledger in `tests/sop/webview-architecture-rules.exemptions.json` —
> thirteen predate the rule and the set may only shrink.

> **Convention.** Utility classes live in the overrides layer, not scattered through
> component sheets.
> *Why:* a utility defined beside a component is invisible to everyone who could reuse it,
> so it gets written again.
> [ADR-018](../architecture/adr/018-css-architecture.md) · Enforced by
> `tests/sop/inline-styles.test.ts`.

> **Convention.** Styling reaches Spectrum through `UNSAFE_className` and the `cn()`
> helper, not through style objects.
> *Why:* it keeps styling in the cascade layers where it can be themed and overridden.
> [styling-guide.md](styling-guide.md) · Enforced by the `staticInlineStyleCeiling` and
> `dynamicInlineStyleCeiling` pins in `tests/sop/inline-styles.test.ts`. The per-file cap
> of five bounds any one file; the pins stop the total growing.

> **Convention.** Class names are not assembled dynamically beyond a small ceiling.
> *Why:* a class built from a variable cannot be traced to a definition, so the check that
> every class exists goes blind.
> Enforced by the `dynamicClassSiteCeiling` ledger in
> `tests/sop/webview-architecture-rules.exemptions.json`.

## 8. Agents are a second door, never the only one

**Position.** Agents call the same functions the buttons call. Every capability has a human
surface; the agent path is additional.

An AI agent reaches the extension through MCP tools, which call the same functions the
buttons call.

That is the point: a capability is not finished until a person can reach it without an
agent, through a command, a button, or something rendered. The agent path is the one that
silently disappears — a misconfigured server, a colleague who does not use Claude — so it
cannot be the only path. Agents gather evidence and compose reports; they do not apply
fixes on their own.

> **Convention.** Every capability has a human surface. MCP tools are additional.
> [ADR-012](../architecture/adr/012-diagnostic-surfaces.md) · Enforced by measurement —
> `.claude/skills/ai-coverage-scan` reports the gap at release cuts.
> *Why:* not everyone uses an agent, and the agent channel is the one that silently disappears.

> **How to add one.** [mcp-tool-authoring](../../.claude/skills/mcp-tool-authoring/SKILL.md) ·
> registration is pinned by `tests/features/ai/server/realSdkRegistration.test.ts`.

---

## 9. Tests

**Position.** Unit tests by default, with dependencies handed in as fakes and assertions on
how they were called. Contract tests only where something crosses a network boundary.
Effectiveness is measured by mutation testing, not coverage.

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
> [ADR-016](../architecture/adr/016-test-strategy.md) · **Not enforced** — which tier fits is
> a judgement about what you are testing.
> *Why:* matching the test to the risk. A live test for pure logic is slow and flaky; a unit test for a network contract proves nothing.

> **Convention.** A split test family shares one `.testUtils` file, which owns the mocks
> and the subject import. [webview-test-authoring](../../.claude/skills/webview-test-authoring/SKILL.md) ·
> enforced by `tests/sop/test-family-setup.test.ts`.
> *Why:* the copies drift otherwise, and a spec that keeps its own copy can silently stop mocking anything.

> **Convention.** When you change a test's structure, diff the set of things it asserts
> before and after — and prove shared setup is load-bearing by breaking it on purpose and
> checking the right suites fail.
> *Why:* the failure mode of a test refactor is a suite that still passes while checking
> nothing. Nothing else catches that. **Not enforced** — it is a habit, and the only guard
> is doing it.

---

#### Also checked here

Enforced automatically. You do not need to hold these in your head — if you break one, the
check says so and names the file.

> **Convention.** No test file over 750 lines.
> [test-file-splitting-playbook.md](../testing/test-file-splitting-playbook.md) · enforced by
> `npm run validate:test-file-sizes`.
> *Why:* past that nobody reads the whole file, so tests get duplicated rather than found.

> **Convention.** A test file lives at the path mirroring the source file it covers.
> *Why:* it is how you find the tests for a file without searching, and how a missing suite
> becomes visible. Enforced by `tests/sop/mirror-placement.test.ts`.

> **Convention.** A fixture builder name has exactly one definition.
> *Why:* twenty-six different fakes of one object means nobody knows what the fake should be.
> Enforced by `tests/sop/builder-uniqueness.test.ts`.

> **Convention.** Do not mock a configuration leaf.
> *Why:* the test then checks the mock rather than the shipped configuration.
> Enforced by `tests/sop/no-config-leaf-mocks.test.ts`.

> **Convention.** Do not lower one test's timeout below the file's budget.
> *Why:* it hides a slow path instead of fixing it, and fails on a busier machine.
> Enforced by `tests/sop/no-lowered-test-timeout.test.ts`.

> **Convention.** Never pipe jest through `tail`, `head` or `grep`. Redirect to a file with
> `> file 2>&1` and read that.
> *Why:* buffering makes a finished run look hung, and the redirect order matters — the
> other way round produces an empty file that reads as a clean pass.
> Enforced by `.claude/hooks/rules/10-jest-pipe.rule` and
> `.claude/hooks/rules/11-jest-redirect.rule`.

> **Convention.** Never start a jest run while another is in flight.
> *Why:* measured — one at a time failed nothing across ten runs; two at once failed four
> to six suites every time, in different suites each run. A concurrent result is noise.
> Enforced by `.claude/hooks/rules/15-jest-concurrent.rule`.
> *Why:* both mistakes report success. A pipe hides the exit code; two concurrent runs fail suites at random.

## 10. What stops this drifting

**Position.** A convention without an enforcer will drift. Each one below says which kind
it is, and the count of unenforced rules is stated rather than hidden.

Conventions decay unless something checks them. Four layers do:

- **Hooks** stop a bad action as it happens — 10 rules in `.claude/hooks/rules/`
- **Enforcer suites** fail the build when code drifts — 22 in `tests/sop/`
- **Typecheck and lint** run over the whole repository in CI
- **Scans** measure at release cuts: duplication, dead code, cycles, agent coverage

**This handbook states 62 conventions. 56 of them are enforced; 6 are not.**

The six that remain are not one thing, and treating them as one is what kept them open:

- **Five cannot have an enforcer.** Which test tier fits, whether a metric measures the
  defect or only its shape, naming the command that would prove you wrong, and diffing a
  test's assertions after restructuring it, and whether a comment about another module is
  actually true. Each is a judgement about intent, and a check
  that scored it would be measuring shape — the exact mistake two of them warn about.
  These are written down for the reader, not pending work.
- **One is not yet true.** No `@layer vendor` exists in `src/`, so enforcing it today would
  fail the build rather than protect anything. It waits on the CSS migration (PL-21).

Twelve were unenforced on the morning of 2026-08-30 and seven closed that day: feature
barrels, the dependency envelope, handlers not rendering, the message-channel singleton,
the `!important` ceiling, inline-style totals, and component style blocks staying local.
An eighth — exit codes read through a pipe — became the tenth hook rule.

The numbers above are checked by `tests/sop/handbook-links.test.ts`, because a count
written in prose is a claim like any other — this document says so two sections up.

A convention here is **one thing you can violate, with one thing that catches you**. If a
callout names two enforcers, it is two conventions, unless both guard the same rule.

### Checking things

The rules above are checked by tools. The tools are checked by these, which this
programme learned the hard way — five separate times a measurement looked clean and was
not.

> **Convention.** Every scan declares a control: something it is known to find. A
> detector that has silently stopped detecting reports "all clear" in exactly the same
> words as one that verified.
> *Why:* a first sweep printed "clean" over a scan that had just measured a 34% gap.
> Enforced by `tests/sop/every-scan-declares-a-control.test.ts`.

> **Convention.** Capture an exit code in a variable. Never read one through a pipe.
> *Why:* `head`, `tail`, `grep` and `wc` all exit 0 on empty input, so the pipe reports its
> own success and hides the failure underneath.
> Enforced by `.claude/hooks/rules/13-piped-exit-code.rule`, which blocks branching on
> a pipe into `head`, `tail` or `wc` — those exit 0 whatever they were fed, so a failure
> and an empty result are indistinguishable. `grep` is deliberately not blocked:
> `cmd | grep -q x && …` is correct, because there grep's own exit code is the answer.

> **Convention.** A count that measures what code *looks like* is not a count of what is
> wrong with it. Before working a scan's list, ask what defect it would catch and whether
> a clean file could score badly.
> *Why:* three measures in this repo were found to describe style rather than defects.
> Extracting duplicated setup into a helper — plainly an improvement — made one of them
> worse. **Not enforced.** It is the question to ask, not a thing a test can check.

> **Convention.** Before naming a cause, name the command that would prove you wrong, and
> run that first.
> *Why:* a cause is cheap to assert, expensive to retract, and the reader usually cannot
> check it. **Not enforced.**

> **Convention.** Quote glob arguments passed to `grep` or `find`. In zsh an unquoted
> pattern is expanded before the command sees it, and an unquoted variable is not split
> into separate arguments.
> *Why:* both fail in ways that look like a clean result rather than an error — with no
> match, zsh aborts and the command never runs at all.
> Enforced by `.claude/hooks/rules/12-unquoted-glob.rule`.

> **Convention.** Anything claiming to be an instrument is in the registry, and the
> registry and the disk must agree in both directions. A count written in prose has
> something checking it.
> *Why:* two scans were once in no list at all, and a validator had been failing silently
> for months because nothing ran it.
> Enforced by `tests/sop/tooling-registry.test.ts`.

> **Convention.** A module path named in a document resolves. A citation must reach a
> file or directory; an `import` in a code example must reach something importable.
> *Why:* a path inside a markdown file is invisible to the compiler, to lint and to every
> test, so a rename is silently right in the code and silently wrong in every document
> that named the old path. An audit found fifty dead ones, thirty-seven of them in example
> code a reader would copy.
> Enforced by `tests/sop/doc-module-refs.test.ts`.

> **Convention.** Delete obsolete code. No deprecated stubs, no accepted-but-ignored
> options. [CLAUDE.md](../../CLAUDE.md) · Enforced by measurement — `.claude/skills/dead-code-scan`.
> *Why:* a deprecated stub still has to be read, understood and skipped by everyone who meets it.

> **Convention.** Secrets live in VS Code settings, never in code. This repository is
> public. [CLAUDE.md](../../CLAUDE.md) · Enforced by
> `.claude/hooks/rules/20-secret-files.rule`, which blocks a write of any `.env` file or
> secret-shaped content headed for the repo tree; GitGuardian scans every push as the
> second line.
> *Why:* git history is permanent and this repository is public, so a secret committed
> once is public forever — deleting it later does not help.

> **Convention.** Commit to `develop`. Reach `master` only through a release.
> [cut-release](../../.claude/skills/cut-release/SKILL.md) · enforced by `.githooks/commit-msg`.
> *Why:* master is what ships to beta users automatically.

> **Convention.** No backticks inside a double-quoted `git commit -m`. Write the message
> to a file and use `git commit -F`.
> *Why:* bash treats `` `x` `` inside double quotes as command substitution, so naming a
> file in backticks — the natural way to write it — silently executes the word and drops
> it from the message.
> Enforced by `.claude/hooks/rules/14-commit-backtick.rule`.

> **Convention.** A new React + Spectrum webview test starts from the webview-test skill.
> *Why:* the suite runs on fake timers, and a test that does not know it hangs or resolves
> before React flushes — presenting as a timeout or a phantom missing element, never as a
> timer error.
> [webview-test-authoring](../../.claude/skills/webview-test-authoring/SKILL.md) ·
> Enforced by `.claude/hooks/rules/40-webview-test.rule`.

> **Convention.** An Adobe documentation lookup goes through the routing skill before the
> first search.
> *Why:* five sources cover different corpora and picking wrong returns confident,
> plausible, off-target results rather than an error. App Builder concepts live on a domain
> neither doc server indexes.
> [adobe-docs-lookup](../../.claude/skills/adobe-docs-lookup/SKILL.md) ·
> Enforced by `.claude/hooks/rules/50-adobe-docs.rule`.

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
