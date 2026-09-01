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

That arrangement only holds if it points one way. Features and commands are built on
core, so core must not know either of them exists; the moment it does, the graph can
close into a cycle and "move it to `core/`" stops being a safe answer.

> **Convention.** Nothing under `src/core/` imports `@/features` or `@/commands`.
> [src/core/CLAUDE.md](../../src/core/CLAUDE.md) · Enforced by the `layerDirection`
> ledger in `tests/sop/architecture-rules.exemptions.json` — seven predate the rule
> and the set may only shrink.
> *Why:* it is what keeps the dependency graph acyclic, which is the premise the cycle
> scan and "move it to core" both rest on.
>
> **This rule was ratified on 2026-08-30, and how it got here is worth knowing.** It had
> been stated as absolute law in `src/core/CLAUDE.md` — with a "❌", which reads as a
> guarantee — while appearing in no handbook entry, no ADR and no convention, enforced by
> nothing, and violated seven times. Two of the seven are commands that merely live in the
> wrong directory, one is `import type` only, and four are real. A prohibition that exists
> in one directory's prose is a wish; this is the version with a check behind it.

> **Convention.** Features do not import other features; commands may.
> [src/features/CLAUDE.md](../../src/features/CLAUDE.md) · enforced by eslint.
> *Why:* it keeps a feature replaceable. Cross-feature imports are how two features quietly become one.

> **Convention.** A module is imported by the path that DEFINES the symbol. No
> re-export-only `index.ts` — not in `core/`, not in a feature. **The ledger is
> CLOSED**: all 43 that predated the rule were retired on 2026-08-31, so this is now
> a ban with nowhere to write an exception down.
> [ADR-022](../architecture/adr/022-barrel-files.md) · Enforced by
> `tests/sop/architecture-rules.test.ts` through `expectBanned`, which asserts both
> halves: no violations, AND no ledger key to write one into.
>
> That second half arrived on 2026-09-01, and this entry is why it was needed. It
> already SAID "a ban with nowhere to write an exception down" while
> `reExportIndex: {}` and `featureBarrels: {}` sat in the exemptions file — empty, but
> still keys. An empty ledger already fails a new violation, so nothing was
> undetected; what remained was the SLOT. The next person to trip the rule could add
> a row with a reason and stay green, and the rule would quietly go back to being
> negotiable. Seven rules that had reached zero were in that state; all seven are now
> banned outright, and re-adding an exemption to any of them fails the build naming
> the rule.
> *Why:* a symbol reachable by two paths is a symbol whose home nobody can name. It is
> also the rule this codebase already follows: **1,935 imports reach into a module from
> outside it, against 162 from within**, so the barrels were the minority report, not the
> convention. Seven of the eight webview bundle entries are `index.tsx` by necessity
> and are read from `WEBVIEW_ENTRIES`, so the check cannot drift from the build. The
> eighth — the dashboard — is `main.tsx`, because an `index.ts` barrel used to sit
> beside it and tsc keeps only one file per basename. That barrel is gone, so the
> constraint is too; the rename is simply not worth an entry-point change.
>
> **This replaced an earlier convention that said the opposite for `core/`, and the
> correction is worth keeping.** The old rule — core is "a shared surface worth curating",
> features get nothing — was measured on 2026-08-31 and the curation was not happening:
> 103 of 165 named exports were never imported through their barrel. Research then found
> the accepted industry rule is about PLACEMENT, not layer: a barrel is the public API of
> a unit, and files inside it import each other directly. Against that rule this codebase
> was not split between two conventions; it was already on the far side of the line, with
> a dozen barrels that a minority of callers used.
>
> **The published performance case was checked and does NOT apply here** — that check is
> the reason the rule is scoped to legibility. Atlassian measured -75% build minutes
> removing barrels across 90,000 files; Angular removed them from its linker for 500ms-1s.
> Our whole typecheck is 3.95s over 2,202 files, and the suite runs in full rather than
> selecting affected tests, so the mechanism behind those wins has nothing to bite on.
> Adopted for one reason, not three.

> **Convention.** A PascalCase `.tsx` exports a component of that name, and an
> exported ALL-CAPS const is `UPPER_SNAKE_CASE`. Files are otherwise named for their
> SUBJECT — `WizardContainer.tsx`, `loadingHTML.ts`, `commerceSections.ts`.
> *Why:* the first makes a component findable from its filename and guessable from
> its symbol, which is the part that actually pays. Enforced by
> `tests/sop/naming-conventions.test.ts`; two files are exempt, each with its reason,
> and the list may only shrink.
>
> **This replaced a four-row rule that contradicted itself, and the correction is the
> interesting part.** It read "commands are `camelCase`, React components
> `PascalCase`, constants `UPPER_SNAKE_CASE`, and a file is named for what it
> exports", and claimed nobody had ever broken it. Measured 2026-08-31: nobody could,
> because the rows disagree. `ResetAllCommand.ts` exports `class ResetAllCommand` —
> PascalCase, which the commands row forbids and the export row requires. Eleven
> `.tsx` files export functions rather than components, so camelCase is right by one
> row and wrong by another. And "named for what it exports" holds for **40%** of
> `src/` (343 of 848): most files are named for their subject and export several
> related symbols, which is the real convention and was not what was written.
>
> A rule that cannot be broken because it contradicts itself reads like a guarantee
> and holds nothing. That is the same failure `src/core/CLAUDE.md`'s "❌" already cost
> once.

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

> **Convention.** A handler answers by RETURNING its result — **Pattern B**.
> `sendMessage` is for progress pushes only, never for the answer itself.
> [where-code-goes.md](../architecture/where-code-goes.md) row 2 · Enforced by the
> `patternBSendMessageCeiling` ratchet in
> `tests/sop/architecture-rules.exemptions.json` — the count may not grow.
> *Why:* a returned result has one caller waiting for it. A pushed one has whoever
> happens to be listening, which is nobody when the caller is an agent or a test.
>
> **Catalogued 2026-08-30.** The rule and its ratchet already existed; the name
> "Pattern B" was used across fifteen files — including two source files and two
> per-directory `CLAUDE.md`s — and defined in none of them. An enforced convention
> absent from this handbook makes the scorecard below an undercount, which is worth
> more than the wording: it means "57 of 63 enforced" was measuring the catalogue,
> not the codebase.

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

**React's own rules are enforced, and it is worth knowing which.** `rules-of-hooks` is an
ERROR: a hook called conditionally, or below a return, fails the build. `jsx-key`,
`no-deprecated`, `jsx-no-target-blank` and the a11y checks on `alt-text` and `aria-props`
are errors too. `exhaustive-deps` is a WARNING — and CI allows warnings, so what actually
catches it is the zero-warning bar the `gate` skill sets on changed files, not the build.
Know the difference before relying on it.

> **Convention.** A value passed into a hook is stable across renders. No inline array,
> object or arrow literal as a prop that will reach a dependency array — hoist it to a
> module-level constant or wrap it.
> *Why:* a literal is a NEW reference every render, so an effect that depends on it runs
> every render, and one that sets state loops forever. It has already happened here.
> **The EMPTY form is enforced**; the rest is not, and cannot be by the obvious rule —
> `exhaustive-deps` reads the dependency array inside the hook and cannot see across the
> prop boundary to the caller that created the value. The compiler cannot see it either:
> the types are identical.
>
> `prop={[]}` and `prop={{}}` carry no data, so the only reason to write one is "this
> component wants a collection and I have none" — which is exactly the shape that loops.
> That is checkable without following the prop anywhere, and it is the case this repo has
> actually been bitten by. Enforced by `tests/sop/webview-architecture-rules.test.ts`
> (`emptyLiteralProps`), seeded EMPTY on 2026-08-31 because `src/` had none: a flat ban,
> not a ledger.
>
> What stays a judgement, with the counts that make it one: 90 inline arrows
> (overwhelmingly event handlers, harmless) and 34 non-empty array/object literals
> (presentational lists and `UNSAFE_style`, covered by their own rules). Whether one of
> those reaches a dependency array cannot be decided without following it into the
> receiving hook.

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

> **Read before your first component.** [spectrum-webview-ui skill](../../.claude/skills/spectrum-webview-ui/SKILL.md) ·
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
>
> **Two thresholds live here and they are not in conflict**, which is worth stating
> because they look it. CREATING a component from repeated markup waits for the third
> site — that is this rule. PROMOTING a component that already exists from a feature
> into `core/` happens at the SECOND consumer
> ([where-code-goes.md](../architecture/where-code-goes.md) rows 7, 8 and 11). Different
> decisions: the first is "is this pattern real yet", the second is "does this belong to
> one feature or to everyone", and the second question is already answered the moment a
> second feature needs it.
>
> The **override** — extract at two when the same behaviour has already been FIXED
> separately on two surfaces — is judgement rather than law, and is stated where you
> meet it (`src/core/ui/components/CLAUDE.md`, the `reuse-first` skill). It has no
> violation condition, so it can have no enforcer: a bug fixed twice is evidence the
> copies must agree, which is the thing the count of three is a proxy for.

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

Every tool answers in one shape, and that shape is built for you. `mcpToolResult.ts`
exports two builders — `asText(value)` serializes, `asRawText(text)` wraps a string that is
already final — and a tool that hand-rolls `{content:[{type:'text',…}]}` fails the build.
The helper was extracted once to kill exactly this duplication and had grown back into ten
registrar modules within a month, one of them a byte-identical copy under the same name.
Note that the surface is not all JSON: refusals answer prose, so never write guidance
promising an agent that every response parses.

> **Convention.** A tool response is built by `mcpToolResult.ts`'s `asText`/`asRawText`,
> never by hand. Enforced by `tests/features/ai/server/responseEnvelope.test.ts`, which
> checks descriptor rows at runtime and every registrar module at the source, in both
> halves of the server.
> *Why:* one envelope is what lets an agent parse any tool's answer the same way — and the
> helper has already been re-duplicated once after being extracted.

> **Convention.** A tool requires an explicit `confirm: true` when its effect is hard to
> walk back: it DELETES something, or it PUSHES to a live site. Merely mutating is
> deliberately not the bar — deploys, lifecycle and config writes stay ungated, because
> they are reversible and gating them would make the agent surface useless for routine
> work. Three irreversible tools go further and require the resource's name echoed back.
> *Why:* reach decides, not the verb. `promote_block_to_library` was ungated because it
> only *adds* things and `refresh_block_library` because "rebuild" sounds local; both push
> to a live site. `set_console_apis` says "set" and removes — a delete wearing a setter's
> name. Judge against the rule, never against how the name reads.
> Enforced in part by `tests/sop/tool-catalog-gating.test.ts`, which stops the published
> catalog understating a gate. **Nothing checks that the RIGHT tools carry the flag** —
> that is the judgement above, made per tool.

> **Convention.** A tool needing credentials pre-flights and returns a structured
> `needsAuth` handoff rather than erroring, so the agent can drive sign-in and retry.
> Every tool DECLARES which sign-ins it needs, or `false` for none.
> *Why:* interactive browser sign-in cannot be refreshed silently, and an error tells the
> agent nothing about what to do next.
> Enforced by the COMPILER: `needsAuth` is a required field on `McpToolSchema` and on
> `ToolDescriptor`, so a tool cannot be registered without answering the question.
>
> **IT WAS A LEDGER FIRST, AND THE LEDGER IS NOW DELETED.** No static check can tell
> whether a tool touches credentials — compliance is reached three ways (`runGuards`, a
> bespoke pre-flight, or nothing because none is needed) and two scans failed in opposite
> directions trying: a file-level one gave 37 tools each other's signals because 23 share
> a descriptor file, and a per-handler one reported nothing for `add_console_apis`, whose
> handler demonstrably calls `runGuards`.
>
> So all 114 tools were reviewed one at a time against a shrink-only ledger, each row
> carrying a verdict and a reason. When it reached zero unreviewed (2026-09-01) every
> verdict moved into the code as a `needsAuth` declaration and the ledger was deleted —
> the arc `featureBarrels` took, and the one the type-erasing-cast ceiling is on.
>
> The declarations were transcribed mechanically and then VERIFIED against the ledger
> row by row: 114 found in code, zero mismatches, zero missing. The field is an ARRAY
> because four tools need two sign-ins — `check_github_app`, `create_project`,
> `republish` and `sync_content` each need GitHub AND DA.live, and a single value would
> have dropped exactly the sign-in an agent then fails to offer.
>
> **The surface is 114 tools, and no previous count was right**: the `tool-verdicts`
> skill says 107, an earlier pass said 102. Both missed `dataInstallerDescriptors.ts`
> (8) and `statusDescriptors.ts` (4).
>
> **THE REVIEW FOUND THREE HANDOFF SHAPES, AND THIS RULE NAMED ONE.** `needsAuth` is
> the shape for a sign-in an AGENT can drive. It is not the only honest answer:
>
> - **`needsUser`** (`src/features/ai/server/handoff.ts`) is the more general form, for
>   work only a PERSON can finish — the DA.live bookmarklet-and-paste, the IMS browser
>   login, a GitHub App install approval. Its own docblock says it "generalises" the
>   `needsAuth` convention. `connect_dalive` is right to use it: no agent can click a
>   bookmarklet.
> - **A domain status** — `siteAccessManagerHeadless` returns `{status:'no_credential'}`,
>   which is structured and deliberately separates "not signed in" from "refused". Its
>   comment records why: merging the two once sent users to the Debug Logs instead of to
>   sign-in.
>
> So the rule is really *return a structured handoff naming what will fix it*, and
> `needsAuth` is one of its shapes.
>
> **A SYSTEMIC BREACH, found by the review on 2026-08-31 and FIXED on 2026-09-01.**
> Every DESCRIPTOR-registered tool failed the rule, and one function did it.
> `defaultShape` in `toolDescriptors.ts` rendered any failure as the string
> `Error: <message> [CODE]` and discarded every other field on the response.
>
> The sharp part: `dataInstallerHandlers` was already doing it right. Its headless
> branch returns `{success:false, error, code, needsAuth:'adobe'}` deliberately, with a
> docblock explaining that an agent must be TOLD rather than prompted. That marker never
> reached the agent — the projector threw it away one layer up. The best auth handoff in
> the repo was invisible, and `ErrorCode.AUTH_REQUIRED` appears nowhere in
> `src/features/ai` to translate it.
>
> `defaultShape` now returns a failure WHOLE when it carries more than `error`/`code`.
> The terse string stays for the common case, because it is deliberate — this output is
> billed as context tokens on every call. All three custom shapes delegate to it on
> failure, so the one change reaches every descriptor tool. Guarded by a regression test
> that asserts the `needsAuth` marker survives, and a control that a plain failure still
> gets the terse string.
>
> **A worse one, also fixed on 2026-09-01: `check_mesh` and `delete_mesh` BLOCKED.**
> `ensureAuthenticated` in `features/mesh/handlers/shared.ts` always awaited
> `showWarningMessage(..., 'Open Dashboard')`, so an unauthenticated call from an MCP
> tool put a notification on the user's window and stopped the tool until somebody
> dismissed it. An agent cannot click, and the user had no idea what was waiting on
> them. It now branches on `context.panel` — prompt for a webview, return the
> `needsAuth` marker for an agent — which is the rule `dataInstallerHandlers` had
> already written down and the mesh handlers never got.
>
> **The last two, fixed the same day: `promote_block_to_library` and
> `remove_block_from_library` THREW** when the DA.live token was missing. The message
> named the recovery, so an agent was not stranded — but erroring is the one thing the
> rule asks tools not to do, and an MCP error is not a result a caller can branch on.
> Both now answer with `needsAuth: 'dalive'`.
>
> Promote carried a second defect the throw hid: the token check ran AFTER
> `applyComponentDefinitionEntry` had rewritten `component-definition.json`, so a
> signed-out caller got the error with a half-done promotion left on disk. The check
> runs first now. Its test asserts `writeFile` was never called — the old test could not
> have caught this, because a rejected promise says nothing about what happened before
> it. Restoring the old order fails that assertion, and only that one.
>
> **All 114 tools now satisfy this rule.** It went from a scan finding to a fact about
> the surface in one day; what made that possible was reading every tool rather than
> trying to detect the breaches statically, which failed three times.

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

> **Convention.** A canonical fake covers its subject's WHOLE public surface, and
> invents nothing.
> *Why:* both halves have failed here. A fake NARROWER than the need is one nobody
> adopts — `stateManagerFake` answered a single method for months while fifty suites
> hand-rolled their own in 22 distinct shapes, so the builder grew the divergence it
> existed to stop. A fake with INVENTED members is worse because it is silent: five
> appeared in hand-rolled StateManager fakes that are not on StateManager at all, and
> two Logger fakes carried `setContext`, `with`, `show` and `dispose`, none of which
> exist and none of which anything calls.
> `jest.Mocked<T>` catches the invented half at compile time, which is why every
> builder is typed. It CANNOT catch the missing half, because each one ends in a cast
> to satisfy the mock type. Enforced by
> `tests/sop/builder-surface-coverage.test.ts`, which reads the subject from source
> and compares in both directions.

> **Convention.** A split test family shares one `.testUtils` file, which owns the mocks
> and the subject import. [webview-test-authoring](../../.claude/skills/webview-test-authoring/SKILL.md) ·
> enforced by `tests/sop/test-family-setup.test.ts`.
> *Why:* the copies drift otherwise, and a spec that keeps its own copy can silently stop mocking anything.

> **Convention.** Before designing a way to hand a mocked collaborator in — or to share
> one between suites — delete the mock and run the suite. If it still passes, the mock was
> the whole problem.
> *Why:* asked twice and answered the same way both times. 28 suites mocked a service
> module and 22 needed no injection at all. Then eleven split-suite families were merged
> and **79 of their shared mocks were dead** — deleted from every suite that carried them
> with nothing failing. Two working sessions went into designing seams for files that only
> needed a deletion, because the question asked was "how would this suite hand the service
> in?" rather than "does this mock change anything?". The check costs one suite run.
> **Half enforced, and the half that is was buildable all along.** "A question to ask,
> not a state to hold" is true of the probe — delete the mock, re-run, see if anything
> notices — and false of the static rule underneath it: a BARE automock of a module
> `moduleNameMapper` already redirects is dead by construction, and that is a state in
> the tree. `tests/sop/redundant-automocks.test.ts` bans it outright (a flat ban, not a
> ceiling — the corpus was already zero when it was written). The probe half stays a
> habit, and stays in `dead-mock-scan` at the periodic cadence.
>
> Three things only that check shows. `jest.mock('vscode')` is a no-op here — `jest.config.js`
> already maps it — and four families carried copies. Mocks can serve only each other: twice,
> a service-locator mock plus the line wiring a fake into it were both dead, because the
> subject takes that fake by constructor; probed one at a time the mock looks essential, so
> probe the SET. And a mock the SPEC imports cannot move to a shared file at all — a
> `jest.mock` only hoists above the imports of the module it appears in, which cost 23
> failing tests to learn.

A mocked service module turns out to be four different things wearing one shape, and the
remedy differs for each:

| What it is | What it needs |
|---|---|
| The mock changes nothing | Delete it. Most common by far |
| The suite genuinely needs the collaborator and cannot hand it in | A seam — an optional parameter defaulting to the real construction |
| The suite asserts the service was BUILT with the right credentials | A *factory* seam. An instance seam skips construction and deletes the property being tested |
| The suite re-mocks mid-test via `require()` | A seam, which removes the ability entirely |

Where a seam is the answer, type it to the methods the code actually calls rather than to
the class. A parameter wider than the need is usually why the mock existed.

**And it is usually why the DUPLICATION existed, which is the same finding pointed at
production code.** When several files each build their own copy of something a shared
accessor already provides, the question to ask first is not "how do I hand this to each
of them?" but "why can none of them call the accessor?" Twice now the answer has been
that the accessor asked for more than it reads:

| Accessor | Asked for | Actually read | Files that built their own instead |
|---|---|---|---|
| `getGitHubServices` | a whole `HandlerContext` | `context.context.secrets` | 5 |
| `componentRegistryFrom` | a whole `HandlerContext` | `.componentRegistry` | *(7 constructions exist; not yet adjudicated)* |

In the first case the width was the whole cause: four of the five callers hold a
`SecretStorage` and no context, so they *could not* call it. Narrowing the accessor
turned four separate threading jobs into four one-line calls, and left exactly one
construction in the codebase — inside the cache, where it belongs.

This is a diagnostic, not a law, and deliberately so — at two instances it has not
earned one. **Do not turn "reads one field of its parameter" into a check.** Ten
functions here do that and most are correct: `MessageHandler` fixes the handler
signature by contract, so a handler that reads one field cannot narrow without
breaking the dispatch map. The signal worth acting on is the conjunction — a shared
accessor exists AND files construct the thing anyway — which is what the architecture
ledger already records.

---

#### Also checked here

Enforced automatically. You do not need to hold these in your head — if you break one, the
check says so and names the file.

> **Convention.** No test file over 750 lines.
> [test-file-splitting-playbook.md](../testing/test-file-splitting-playbook.md) · enforced by
> `npm run validate:test-file-sizes`.
> *Why:* past that nobody reads the whole file, so tests get duplicated rather than found.

> **Convention.** No test file repeats another file's tests wholesale.
> *Why:* the rule above predicted this and it happened anyway. One 2025-11-18 commit split
> four oversized suites by COPYING tests into the new files instead of moving them, and four
> whole files sat as byte-identical duplicates for nine months —
> `installHandler-shellOptions`, `-adobeCLI`, `-sharedUtilities` and
> `ComponentRegistryManager-registration`, the last of which never tested registration at all
> because the class has no such method. They cost time on every run and quietly inflated
> coverage and mutation scores by killing the same mutants twice. The clone scan could not
> say so: jscpd counts duplicated line RANGES, so a wholly redundant file reads as an
> ordinary mid-table clone pair — the census had recorded one of these as "4 clones", which
> looks like an extraction job rather than a deletion. Enforced by
> `tests/sop/duplicate-test-files.test.ts`, which compares whole test sets within a
> directory.

> **Convention.** A fake standing in for a real type comes from the builder for that
> type. `{...} as unknown as Project` is a fake with the type check switched off.
> Enforced by the `castCeilings` pins in `tests/sop/canonical-fakes.ledger.json` —
> nine types that already have a builder, and the count for each may only fall.
> *Why:* every fixture defect found on 2026-08-31 was hiding behind one of these
> casts, and none of them was visible to any check. Twenty-six StateManager members
> faked for methods that DO NOT EXIST — three called nowhere in `src/`, one belonging
> to the authentication service. A whole HandlerContext that was `{}`. An argument
> passed `as never`. `{ status: 'running' }` standing in for a Project. Each one
> typechecked, each one passed, because a cast is an instruction to stop checking.
>
> **The target is zero for these nine, and only these nine.** They are not the
> reasonable-looking casts — they are the ones with a builder sitting next to them:
> `Project` (198), `HandlerContext` (59), `Logger`, `StateManager`, and friends, 410
> in total. A cast to a type with NO builder is not counted and is often right: a
> fetch `Response` stub carrying three of its twenty members is correct when the code
> reads three. The rule is *use the builder that exists*, not *never cast*.
>
> A ceiling rather than a file ledger, because 324 files carry one of these and that
> is too many rows to keep honest, while nine numbers maintain themselves. The pin
> demands EXACT equality: lowering a count means lowering the pin in the same commit,
> so the ratchet cannot slacken and a regression cannot hide beneath a stale number.
>
> **And the inverse, so this is not read as "literals are bad".** A fake of a
> ONE-METHOD interface is complete by construction and needs no builder. Measured
> 2026-08-31: `{ dispose }` (78 uses), `{ getAccessToken }` (65), `{ report }` (41)
> and `{ executeCommand }` (38) each stand in for an interface with exactly one
> member — `vscode.Disposable`, `TokenProvider`, `vscode.Progress`, the vscode
> commands bridge. 222 literals, all correct as written. The smell is
> INCOMPLETENESS relative to the real type, not hand-writing; a one-method
> interface cannot be incomplete, and building those four builders would add
> indirection with nothing behind it.

> **Convention.** A test file lives at the path mirroring the source file it covers.
> *Why:* it is how you find the tests for a file without searching, and how a missing suite
> becomes visible. Enforced by `tests/sop/mirror-placement.test.ts`.

> **Convention.** A fixture builder name has exactly one definition.
> *Why:* twenty-six different fakes of one object means nobody knows what the fake should be.
> Enforced by `tests/sop/builder-uniqueness.test.ts`.

> **Convention.** A fake that has a builder in `tests/helpers/` is imported, not written
> again inline. Enforced by `tests/sop/canonical-fakes.test.ts` — a shrink-only ledger
> grandfathers the files that already do, so it stops new copies rather than demanding a
> sweep.
> *Why:* 420 files hand-roll a logger, and the count was still climbing — about twenty new
> hand-rolled fakes appeared in one day of dependency-injection work, because each newly
> converted service needs a fake and typing one is faster than finding the builder. The
> pool is a chore; the rate is the problem.

> **Convention.** A fake that a SECOND feature directory needs lives in `tests/helpers/`.
> A `*.testUtils.ts` beside a suite is for setup specific to that subject.
> *Why:* the test is mechanical — does another feature need it? The suite already holds
> 98 builder functions; the problem was never unwillingness to share but that 14 of those
> NAMES are defined in more than one file, so there is no canonical one to find and
> writing another is cheaper than searching.
> [ADR-016](../architecture/adr/016-test-strategy.md) · Enforced by
> `tests/sop/canonical-fakes.test.ts` § "a fake two feature directories need lives in
> tests/helpers/".
>
> **It was filed as unenforceable — "where a builder belongs is a judgement about who
> needs it" — and that was wrong.** The rule's own wording gives the test: *does a
> SECOND feature directory need it?* is mechanical once you resolve imports instead of
> matching names. Measured 2026-08-31: 139 builders live outside `tests/helpers/` and
> ZERO are imported from a second feature directory, so it is a flat ban with nothing
> to grandfather.
>
> Counting IMPORTS rather than CALLS is the whole check. A first pass matched call
> sites by name and reported nine violations; the worst was `createProject`, which is
> also a production function, so every handler test calling the real one looked like a
> consumer of the fake.

> **Convention.** No test erases a type. `as any` and `as never` are banned anywhere in
> `tests/`. A builder is declared as the REAL type it stands for; where the structural
> fake cannot satisfy that type honestly, cast the object literal INTO it at the
> builder's boundary as `as unknown as X` — once, where it is visible.
> *Why:* `as any` and `as never` are not casts, they are the absence of one. Both leave
> every DOWNSTREAM use unchecked as well, because what comes out has no type left to
> check against. `as unknown as X` still names X, so the lie stays local to the
> construction site and callers stay honest. `as never` is the worse of the pair:
> `never` is assignable to every type, so it is a skeleton key that reads like a locked
> door.
>
> A builder typed `(): Logger` also stops compiling the day `Logger` gains a method —
> one failure, one fix, at the one place that needs changing. A fake cast to `never`
> fails nothing and silently ceases to resemble what it stands for.
>
> **Watched pay off on 2026-08-31.** Converting `publishKeyRegistrar`'s suite off its
> module mock let it pass a typed logger, and typing it FAILED THE BUILD on
> `logger.debug.mock` — a real `Logger` has no `.mock`. Eleven `as never` casts had been
> hiding that. The answer is `jest.Mocked<Logger>`: assignable to `Logger`, so no cast at
> the call, with the mock still reachable.
>
> The line is not a theory — the canonical builders already fake types no object literal
> can satisfy (`CommandExecutor` and `StateManager` are CLASSES with private fields) and,
> measured the same day, `tests/helpers/` contains ZERO of either banned form. The right
> way was already in use; it had just never been written down, while
> `@typescript-eslint/no-explicit-any` sat switched OFF for `tests/`.
>
> Enforced by `tests/sop/type-erasing-casts.test.ts` — a shrink-only ceiling, because
> there were 1,916 across 341 files when the rule was adopted and a ban that emits 1,916
> errors gets switched off within a week. `npm run typecheck:tests` catches the builder
> half the moment a builder is honestly typed. When both counts reach zero, that suite is
> deleted and replaced by a `no-restricted-syntax` ban, exactly as the feature-barrel
> ledger became a ban when it emptied.
> [ADR-016](../architecture/adr/016-test-strategy.md)

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

- **Hooks** stop a bad action as it happens — 11 rules in `.claude/hooks/rules/`
- **Enforcer suites** fail the build when code drifts — 32 in `tests/sop/`
- **Typecheck and lint** run over the whole repository in CI
- **Scans** measure at release cuts: duplication, dead code, cycles, agent coverage

**This handbook states 73 conventions. 72 of them are enforced; 1 is not.**

The one is not unenforceable — it is **not yet true**. No `@layer vendor` exists in
`src/`, so a check would fail the build today rather than protect anything. It waits on
the CSS migration (PL-21), which is not authorised. That is a rule with a start date,
not debt.

Everything else on this page has something that fails the build when it is broken.

**Nine rules left this list on 2026-09-01 and are now [§11 Working
discipline](#11-working-discipline).** None was deleted. They turn on a judgement no
check can make — whether you aimed a command at the right question, whether a matching
string has been read back to its source, whether a fixture's shape was read or
remembered — and counting them here made the score describe two different things at
once. The owner's directive that started it was *"if it cannot be enforced, it probably
shouldn't be a convention"*, and the honest reading of "probably" is the second half of
the test: a rule that cannot be enforced AND prevents no defect anyone can name should
go. All nine prevent one that is named and dated, so all nine stayed — under a heading
that claims nothing about the build.

**This paragraph is why the scorecard above it is generated.** It once read "the fifteen
that remain" and "fourteen cannot have an enforcer" beside a count of eleven, and listed
five rules that had since been enforced. Nothing caught that, because a number written
in prose is checked by nothing — the same defect these rules keep warning about, in the
document that warns about it. Counts come from `npm run docs:conventions` now, and
`tests/sop/handbook-links.test.ts` fails when a sentence here disagrees with them.

The count of unenforced conventions **tripled** across 2026-08-30/31, and that is the
scorecard getting honest rather than the codebase getting worse. Every one of them was
already a rule somewhere — in an ADR, in a directory guide, in `CLAUDE.md` — being
followed and going unexplained. Writing them here does not weaken enforcement; it stops
the handbook implying that "documented" and "checked" are the same word.

The last three joined on 2026-08-30 and had lived only in `CLAUDE.md` until then — seen by
every agent session, never explained to a human reader. One of them was violated the same
day it was written down here, which is the honest measure of what a handbook entry does:
it explains a rule and pins it against drift. It does not make anyone follow it.

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
> Enforced by `tests/sop/every-scan-declares-a-control.test.ts`, and — for the
> instruments that live OUTSIDE the scan directory — by
> `tests/hooks/rule-proofs.test.ts` and `tests/sop/eslint-type-aware.test.ts`.
>
> `tests/sop/codemod-harness.test.ts` is the same rule applied to the tool that
> REWRITES the code: it runs `scripts/codemod/selftest.mjs`, which ends in a
> deliberately false assertion, and asserts the exact failure count — so a self-test
> reporting zero failures fails the build, because a checker that cannot fail is not
> a checker.
>
> Those three were added on 2026-09-01, after the same failure appeared three times in
> one day: a hook rule that never reached its own guard, a blocking rule with no proof
> harness at all, and a bracket expression that had silently stopped matching. All
> three exited 0 and looked fine. An instrument whose dependencies live elsewhere —
> a router pre-filter, a rule name owned by a third party, a tsconfig that must still
> cover the tree — needs a planted defect it must find AND a clean case it must
> ignore, or it can degrade into a command that reports nothing and reads as good
> news.

> **Convention.** Never publish an identifier you have not read from the source. Setting
> keys, env vars, command ids, file paths and function names are cheap to grep and
> expensive to get wrong in something a user reads.
> *Why:* `demoBuilder.eds.defaultDaLiveOrg` went into release notes from memory; the key it
> should have named was `demoBuilder.daLive.defaultOrg`. Caught only by diffing
> `package.json` against the previous tag.
>
> **This entry then broke its own rule**, and that is why it is now enforced. It said "the
> real key IS `demoBuilder.daLive.defaultOrg`" in the present tense long after that setting
> was DROPPED (`6e14114b9` — the DA.live org became a GitHub-namespace picker with no
> setting at all). A correction naming a second dead identifier is the original defect
> wearing the fix's clothes.
>
> Enforced by `tests/sop/cited-identifiers.test.ts`: every `demoBuilder.*` key a
> CURRENT-TENSE document names must exist in `package.json` or be registered in `src/`.
> Historical genres (CHANGELOG, research, ADRs) are excluded, and a deliberate mention of
> a removed identifier goes in the ledger with its reason.
> `tests/sop/doc-module-refs.test.ts` covers file paths.

> **Convention.** Capture an exit code in a variable. Never read one through a pipe.
> *Why:* `head`, `tail`, `grep` and `wc` all exit 0 on empty input, so the pipe reports its
> own success and hides the failure underneath.
> Enforced by `.claude/hooks/rules/13-piped-exit-code.rule`, which blocks branching on
> a pipe into `head`, `tail` or `wc` — those exit 0 whatever they were fed, so a failure
> and an empty result are indistinguishable. `grep` is deliberately not blocked:
> `cmd | grep -q x && …` is correct, because there grep's own exit code is the answer.

> **Convention.** A list of paths reaches a command through `xargs`, never as a bare
> `$VAR`. Quote the variable when one argument is what you meant.
> *Why:* bash word-splits an unquoted variable and **zsh does not**, so
> `FILES=$(...)` followed by `eslint --fix $FILES` passes ONE argument containing
> newlines instead of N paths. The command then runs against a path that cannot exist,
> most tools call that nothing to do, and exit 0 — the failure reads exactly like
> success. Three incidents: a seven-path `git rm` that deleted nothing while the echo
> after it announced success; the same shape again the same session; and on 2026-09-01
> an `eslint --fix` over 18 files that fixed none, where the unchanged recount was read
> as "these warnings are not auto-fixable" — a wrong conclusion drawn from a command
> that never ran. Through `xargs` it fixed all 18 and went five below the baseline.
> Enforced by `.claude/hooks/rules/16-unsplit-var.rule`, which fires only when the
> variable was assigned from `$(...)` AND is passed bare to a command that takes a list
> of files. `[ $n -gt 0 ]` does not fire; `echo $VAR` does not fire; a quoted `"$VAR"`
> never fires. This rule was in prose here since August and was broken a third time by
> the session that had just read it, which is the argument for mechanising it.

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

## 11. Working discipline

The nine rules below were counted as conventions until 2026-09-01, and the count was
the problem. A convention here is a statement about the CODE, and every one of them is
checked by something that fails the build. These nine turn on a judgement no check can
make — mostly about how you investigate a question, once about the code but resting on
the same kind of call. Averaging the two made "70 of 80 enforced" a number that
described neither.

**They are not weaker for being here, and none of them was deleted.** Each names a
specific failure it would have prevented, with a date, and several were written the day
that failure cost something. What changes is only the claim: nothing on this page fails
the build, so nothing on this page is counted as if it did. The conventions list now
means one thing — a rule stated there has an enforcer — and this list means another: a
habit you have to keep yourself.

The test for keeping one is the owner's, from the directive that started this: a rule
that cannot be enforced AND that nobody can point at a defect for should be deleted, not
preserved because it reads well. All nine pass the second half. If one ever stops
passing it, delete it.

> **Discipline.** Before writing a check, ask whether a tool here already performs
> it. When a change repeats across more than about ten sites, drive it from a SYNTAX
> TREE — never from a regex over source text.
> *Why:* text cannot tell code from a string literal or a comment, and that is not a
> care problem. On 2026-09-01 a regex converter deleted ` as never` from inside a
> detector's own control fixtures — the strings that prove the argument-cast detector
> can see a cast — silently disabling the proof while the enforcer kept passing. The
> same day, a hand-rolled "is this import still used?" scan was wrong twice where
> eslint's parsed output was right, and a prior about which casts were redundant was
> wrong 29 times out of 36. A ts-morph probe over a file holding a cast in code, a
> cast in a string and a cast in a comment returned exactly the two real ones.
> [toolchain.md](toolchain.md) says which tool answers which question;
> `ask-the-tool` is the procedure. **Not enforced** — no check can ask why you
> reached for a regex.

> **Discipline.** A comment describing what ANOTHER module does must cite the code that
> makes it true. If you cannot cite it, write what you verified instead.
> *Why:* nothing keeps such a comment true — not the compiler, not the tests — and it reads
> to the next person as verified fact. Two comments once asserted a scheduled re-registration
> that did not exist; they were false the day they were written, and they suppressed the
> question that would have found a shipped bug. **Not enforced** — no check can read intent.

> **Discipline.** When a parent selection changes, clear the state that depends on it.
> Change the Adobe project and the workspace selection goes with it.
> *Why:* a stale child selection is how an operation targets a resource nobody chose —
> the failure `withOrgContext` and the org-mismatch guard exist to catch downstream. The
> place it belongs is the selection handler's `onSelect`, where `useSelectionStep` puts
> it. Obeyed at 7 sites today.
> **Not enforced**, and this one cannot be: 14 sites assign the parent field and reading
> them shows most are not selections at all — one preserves a previous value, one builds
> a display object, one assembles a payload from already-resolved context. A detector
> written from the field name would report eight violations of which roughly none are
> real, and a check that cries wolf gets switched off.

> **Discipline.** The three tiers, and which applies.
> [ADR-016](../architecture/adr/016-test-strategy.md) · **Not enforced** — which tier fits is
> a judgement about what you are testing.
> *Why:* matching the test to the risk. A live test for pure logic is slow and flaky; a unit test for a network contract proves nothing.

> **Discipline.** When you change a test's structure, diff the set of things it asserts
> before and after — and prove shared setup is load-bearing by breaking it on purpose and
> checking the right suites fail.
> *Why:* the failure mode of a test refactor is a suite that still passes while checking
> nothing. Nothing else catches that. **Not enforced** — it is a habit, and the only guard
> is doing it.

> **Discipline.** A fixture's shape is READ, not remembered. A builder's method list
> comes from the real interface plus what callers actually use; a data fixture is copied
> from a real artifact on disk. And a domain fixture is CONTENT over a canonical shape,
> never a re-implementation of one the suite already has a builder for.
> *Why:* an invented shape typechecks, parses, passes review, and fails only when a real
> accessor touches it. `componentInstances` is the one that catches people — a record
> keyed by component id, not an array, and a fixture inventing `components: [...]`
> compiles cleanly because the field is optional.
> [ADR-016](../architecture/adr/016-test-strategy.md) · **Not enforced** — the tell is
> being able to state a shape without naming the file you read it from, which no check
> can ask.

> **Discipline.** A control proves the tool works, not that you aimed it right. Before
> trusting a result of nothing, say where the answer would be if it existed, and confirm
> the command actually reads there.
> *Why:* a correct command pointed at the wrong place passes every control it has, because
> the control shares the mistake. Five wrong answers in one day on 2026-08-11 were all this
> — and on 2026-08-30 a status summary reported two tracks of work as "not started" because
> it grepped for whether a backlog item was TITLED "Track 4", while seven ratified ADRs, a
> 709-line handbook and twenty-four shipped test plans sat on disk. The grep was right; the
> question it answered was not the question asked. **Not enforced** — no check can ask
> whether you aimed at the right thing.

> **Discipline.** A named field in a response, a matching string, or a green check is a
> LEAD. Read the source before it becomes a finding.
> *Why:* `enabled: false` was read as "this org lacks the entitlement" and was wrong; a
> `confirm: true` sitting eight lines past a grep window was read as "this destructive tool
> is ungated" and was wrong. Both were one read away from correct. **Not enforced** — this
> is a habit, and the cost of skipping it is a confident wrong answer.

> **Discipline.** A count that measures what code *looks like* is not a count of what is
> wrong with it. Before working a scan's list, ask what defect it would catch and whether
> a clean file could score badly.
> *Why:* three measures in this repo were found to describe style rather than defects.
> Extracting duplicated setup into a helper — plainly an improvement — made one of them
> worse. **Not enforced.** It is the question to ask, not a thing a test can check.

> **Discipline.** Before naming a cause, name the command that would prove you wrong, and
> run that first.
> *Why:* a cause is cheap to assert, expensive to retract, and the reader usually cannot
> check it. **Not enforced.**

## Where the reasoning lives

This file says what to do, with one line on why each rule earns its place. It does not
carry the full argument, and that is deliberate — the two have different lifespans.

An **architecture decision record** explains why a choice was made and what was rejected.
It records one moment and is not edited afterwards; when a decision changes, a new record
supersedes it. The index is [docs/architecture/adr/README.md](../architecture/adr/README.md).

Reach for one when a rule here looks arbitrary and you are about to remove it. That is
what they are for. ADR-007 exists because the obvious way to encode a product URL
silently breaks every product page — the rule alone would not have told you that.
