---
name: webview-test-authoring
description: Write or fix a React/Spectrum webview component test in this stack — ADR-016's double style applied to webviews, the zero-tolerance console gate that now FAILS on an act() warning, the mock preamble, the fake-timer userEvent contract, hoist-safe testUtils extraction, querying div-role cards, and the mocked-vs-bundled-JSON trap. Use when adding a test for any component under src/**/ui/, when a webview test fails confusingly (real Spectrum rendering, timers hanging, an act() warning failing the run, "unable to find role"), or when splitting an oversized component suite.
---

# Webview Test Authoring

The handbook is `tests/README.md` (organization, naming, location, AAA, mock-derivation
guidelines) and `docs/testing/test-file-splitting-playbook.md` (when and how to split).
`spectrum-webview-ui` is the build-side counterpart to this skill. This file is only the
incident-derived mechanics those docs don't cover — read the docs for the how, read this
for the traps.

## When NOT to use
- Extension-side (node) handler/service tests — no Spectrum, no jsdom, no fake-timer
  contract. Follow `tests/README.md` and the existing `*Handlers.test.ts` neighbours.
- The TDD process itself (RED-GREEN-REFACTOR, what to assert) — that's
  `rptc:tdd-methodology`.
- Deciding *whether* to split an oversized file — that's the splitting playbook. Come back
  here for the hoist-safe mechanics of the split itself.

## Non-negotiables

- **Never pipe jest through `tail`/`head`/`grep`** — output buffering makes it look hung.
  Redirect to a file and read that. A PreToolUse hook blocks it (`.claude/hooks/rules/10-jest-pipe.rule`).
- The react project is jsdom + `tests/setup/react.ts`, which calls `jest.useFakeTimers()`.
  Everything below follows from that. (This line used to cite line 49; it is line 50 as of
  2026-08-31, which is the argument for not citing a line number at all — grep the call.)
- **An `act()` warning FAILS your suite.** Not a warning any more — see §0b.

## 0. The double style: what a webview test hands in

[ADR-016](../../../docs/architecture/adr/016-test-strategy.md) is the law for all tests
here; this section is only what it means on the webview side. Read it once for the three
tiers and the four fixture rules.

**Deps-object fakes are the target double style** (ADR-016 § Decision, tier 1). A webview
component gets its dependencies as PROPS — that is ADR-017's rule, and it is also what
makes this possible. So the double is a plain object you pass in, not a `jest.mock` of the
module the component imports.

The per-suite `jest.mock` of `@adobe/react-spectrum` in §2 is NOT an exception to this. You
are not faking a collaborator there; you are replacing a rendering library that does not
work in jsdom. The distinction is whether the thing being mocked is something the component
could have been HANDED. Spectrum could not be.

**Where the fake comes from, in priority order** (ADR-016 § Fixtures and fakes):

1. **A builder in `tests/helpers/`** if one exists. `createMockLogger` is the one you will
   reach for most; `projectFake`, `handlerContextTestHelpers`, `webviewFixtures` and a dozen
   others are there too. **Look before you write** — `tests/sop/canonical-fakes.test.ts`
   fails a NEW suite that hand-rolls a covered fake, and names the import you wanted.
2. **The suite's `.testUtils`** for setup specific to this subject (§3).
3. **A literal**, only when neither fits. Then: type it to the real interface, never
   `as never` or `as any` (ADR-016 rule 2), and read the shape rather than remembering it
   (rule 3 — and §5 below is the webview-specific version of that trap).

**Message payloads are the shape most often invented here.** `tests/helpers/webviewFixtures.ts`
is the worked example ADR-016 rule 3 points at: it lives in a file `npm run typecheck:tests`
reads, so a payload that does not match the real interface fails to compile instead of
failing a screen at run time. Five invented shapes shipped in one afternoon before it
existed. If a shape crosses the extension↔webview boundary, build it there.

## 0b. Run noise is zero, and the gate keeps it there

`tests/setup/consoleGate.ts` fails any suite that emits `console.error` or `console.warn`
during a passing run, unless the suite is listed in `tests/setup/console-allowlist.json`.

**That allowlist is now EMPTY.** It was seeded at 68 offending suites on 2026-08-28 and has
been burned down to nothing (verified 2026-08-31 by planting a `console.error` in an
unledgered suite — it fails, and the failure names the gate). The list may only shrink, so
there is nowhere to put a new one.

This changes what an `act()` warning costs you. ADR-016 measured **355 of them per green
run**; they were noise you could scroll past. Now one fails your suite, which is the point —
an act() warning means React state settled outside the assertion window, so the test was
checking a render that had not finished. It was always a real signal and is now an
enforced one.

The three that produce them here, all avoidable:

| Symptom | Cause | Fix |
|---|---|---|
| Warning after a click | `userEvent.setup()` without `advanceTimers` | §1 |
| Warning after an async prop/message update | asserting straight after the act | `await screen.findBy…` or `await waitFor(...)`, not `getBy…` |
| Warning at teardown | a timer or promise still resolving | flush it in the test, or clear it in the component's cleanup |

Reach for `findBy*` over `waitFor` where both work — it retries the query itself and its
failure message names the element you wanted.

## 1. userEvent must be told about the fake timers

```ts
const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
```

Omit `advanceTimers` and `await user.click(...)` hangs or resolves before React flushes —
it presents as a timeout or a phantom "element not found", never as a timer error. Wrap a
repeated `setupUser()` helper in the suite's testUtils.

Since §0b, it also presents as an `act()` warning that FAILS the suite — which is a better
diagnosis than either of the other two, so read the warning before assuming a query bug.

## 2. The Spectrum mock preamble

Spectrum primitives are mocked per-suite (the directory convention), not globally. Mock
only what the component tree actually renders, and **spread `...props` last** so a
`data-testid` passed by the component overrides anything the stub hardcodes.

```tsx
jest.mock('@adobe/react-spectrum', () => ({
    Button: ({ children, onPress, isDisabled, variant, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} data-variant={variant} {...props}>{children}</button>
    ),
    ActionButton: ({ children, onPress, isQuiet: _isQuiet, UNSAFE_className, ...props }: any) => (
        <button onClick={onPress} className={UNSAFE_className} {...props}>{children}</button>
    ),
    Link: ({ children, onPress, isQuiet, ...props }: any) => (
        <span role="link" tabIndex={0} onClick={onPress} {...props}>{children}</span>
    ),
    DialogContainer: ({ children }: any) => <div data-testid="dialog-container">{children}</div>,
    // Heading/Text/View/Flex/TextField as needed
}));
```

Extra rules:

- **`onPress` → `onClick`.** Spectrum's press events don't exist in jsdom; the stub must
  translate. Same for `isDisabled` → `disabled`.
- **Icons need explicit mocks.** Every `@spectrum-icons/workflow/*` import the tree pulls
  in gets its own `jest.mock` returning a `default` stub with `__esModule: true`.
- **The core `Modal` stub must honour `actionButtons` and `closeLabel`**, because callers
  drive confirm/cancel through them:

```tsx
jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: ({ title, actionButtons = [], onClose, closeLabel, children }: any) => (
        <div role="dialog" aria-label={title}>
            {children}
            <button onClick={onClose}>{closeLabel ?? 'Close'}</button>
            {actionButtons.map((b: any, i: number) => (
                <button key={i} onClick={b.onPress} disabled={b.isDisabled}>{b.label}</button>
            ))}
        </div>
    ),
}));
```

With several dialogs mounted at once, `role="dialog"` is ambiguous — always disambiguate by
accessible name: `screen.getByRole('dialog', { name: /remove app builder component/i })`.

## 3. testUtils must own the SUT import — the silent hoisting trap

`babel-plugin-jest-hoist` lifts `jest.mock` above the imports **of the module it appears
in**, not across modules. So when a suite grows past the 500-line limit and you extract the
preamble into `<Name>.testUtils.tsx`, the spec must **not** import the component itself: if
the spec's component import executes before the testUtils module, the component binds to
**real** Spectrum. That fails as confusing assertion noise, never as a clear error.

The fix (59 `*.testUtils.*` files in this repo already do it — `aiHandlers.testUtils.ts`
and `ProjectDashboardScreen.testUtils.tsx` are the reference): **the testUtils file imports
the SUT and re-exports it, or wraps it in a `render*` helper.** Specs import everything
from testUtils and never reach for the SUT directly.

```tsx
// <Name>.testUtils.tsx — jest.mock calls first, then:
import { Thing } from '@/features/.../Thing';           // safe: mocks hoist above this
export function renderThing(opts = {}) { return render(<Thing {...opts} />); }
// handler suites instead: export { handleX, handleY } from '@/features/.../handlers';
```

Also export a `reset*Mocks()` that each spec calls from its own `beforeEach` (a shared
`beforeEach` in testUtils does not apply to importing specs).

`import/first` is **not** a registered rule in `eslint.config.mjs` — do not add an
`eslint-disable` for it; that itself errors as an unknown rule. Leave a comment explaining
why the import sits below the mocks.

## 4. Querying webview components

- Clickable card tiles are `<div role="button" aria-label={...}>`, so query by accessible
  name, not text: `screen.getByRole('button', { name: 'custom-app, Deployed' })`.
- A card's face affordance is a child of the tile. Scope with `within(tile)` — a bare
  `getByRole('button', …)` matches the tile itself.
- To assert stop-propagation containment, click the child and assert the parent's effect
  did **not** happen (e.g. no drawer opened).

## 5. Mocked catalog vs bundled JSON

Config loaders like `getAppBuilderComponentEntry` read the **bundled** JSON
(`src/features/*/config/*.json`), not any catalog the test passes as a prop. A fixture id
that looks catalog-ish is therefore not one. Derived flags key off the real file, so:

- Use a **real** id from the bundled JSON when the behaviour depends on catalog membership
  (`app-builder-shell` is the only `kind: 'integration'` entry, and it is `blank: true`).
- Or mock the loader with a faithful fake and pin the real lookup in the loader's own suite
  (`integrationCardModel.testUtils.ts` does this).

Symptom of getting it wrong: an affordance that should be hidden renders anyway, with the
fixture looking entirely correct.

### The general rule: copy state fixtures from a REAL artifact

The trap above is one instance of a bigger one. Any fixture standing in for persisted extension
state — a project, a component instance, a wizard state — must be copied from a real file, not
written from memory. Read one and print the keys:

```bash
python3 -c "
import json; d=json.load(open('$HOME/.demo-builder/projects/<name>/.demo-builder.json'))
ci=d.get('componentInstances') or {}
[print(k,'->',{x:v[x] for x in ('id','type','subType','status','port') if x in v}) for k,v in ci.items()]
"
```

`componentInstances` is the one that catches people, and it caught this repo on 2026-08-17: it is
a **record keyed by component id**, not a `components` array. The frontend port lives on the
instance whose `type` is `frontend`. The mesh is found by `subType: 'mesh'` on an instance whose
`type` is `dependency`. A fixture inventing `components: [...]` and `frontendPort` typechecks
cleanly (the fields are optional) and fails the moment a real accessor touches it.

`typecheck:tests` does NOT save you here — that is what it is for and it still cannot see this,
because an invented shape with optional fields is a valid `Project`. The tell is being able to
write the shape without being able to say which file you read it from.

The MCP-side counterpart, with the schema and accessor variants, is
`mcp-tool-authoring` § "Never write a shape you have not read".

## 6. `clearAllMocks()` does NOT reset implementations

`jest.clearAllMocks()` clears recorded **calls**, not implementations. A
`mockRejectedValue` / `mockResolvedValue` / `mockImplementation` set inside one test
survives into every later test in the file. The symptom is a test that passes alone and
fails in sequence, with an error belonging to a *different* test's setup.

When a suite's `beforeEach` sets up a shared mock the tests then override, reset it
explicitly:

```ts
beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteCommand.mockReset();      // drops the leaked implementation
    mockGetActivePanel.mockReturnValue(null);  // re-establish the default
});
```

`mockReset()` clears implementations too, so re-establish any default the suite relies on
immediately after.

## 7. `jest.mock('os')` needs a module factory

`jest.spyOn(os, 'homedir')` does **not** intercept the SUT. Use a module-factory mock whose
default is a nonexistent path, so a missed override fails loudly instead of touching the
real home directory. A test once wrote the real `~/.claude.json` this way.

## 8. Changing a contract means auditing its MOCKS, not just its callers

`tsc` and the callers keep each other honest; a hand-written mock is invisible to both. It
keeps returning the OLD shape and the suite either fails confusingly or — worse — passes
while asserting behaviour that no longer exists.

Four instances in a single day (2026-07-31), each caught only by running the suite:

| Change | Stale mock | How it surfaced |
|---|---|---|
| Handler wrapped in `withProgress` | `dashboardHandlers.testUtils` had no `withProgress`/`ProgressLocation` | Handler threw inside the test |
| Client moved to `Map<type, Set<handler>>` | Mock kept ONE handler per type | Only the last registration fired |
| Menu rows gained icons + `<Text>` | Per-suite Spectrum mock had no `Text` | "Element type is invalid… got: undefined" |
| `runGuards` → typed `{ error, code? }` | Mock resolved a bare string | `error: undefined` in the result |

So when you change a signature, return shape, or registration structure, grep for its mocks
BEFORE running anything:

```bash
grep -rn "<symbol>" tests/ --include="*.ts" --include="*.tsx" | grep -i "mock\|testUtils"
```

Two traps specific to this repo:
- **A per-suite Spectrum mock only exports what the tree rendered WHEN IT WAS WRITTEN.** Adding
  any primitive to a component (`Text`, `Section`, `SubmenuTrigger`) breaks every suite mocking
  that module — §2 says mock only what renders, which is right, and this is its cost.
- **`.testUtils` files are shared across a split suite** (§3), so one stale mock fails several
  files at once. Fix the helper, not the individual suites.

The failure to fear is the silent one: a mock returning the old shape that still satisfies a
loose assertion (`expect(result.success).toBe(false)`) proves nothing once the shape changed.
Assert the FULL object when a contract carries a new field.

## Before finishing

Run `gate`. Then confirm no test file exceeds 500 lines (`max-lines` warns at 500, and CI
blocks at 750) — if the suite you just wrote trips it, split it per §3 and the playbook,
keeping the test count identical across the split.
