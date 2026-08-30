# Splitting an oversized test file

> **Provisional.** Splitting rules are a consequence of the test strategy, and the
> strategy itself is being canonised. What is here is verified true today; the
> shape may change when that lands.

## When

eslint warns at 500 lines and errors at 750; CI blocks a merge past 750
(`.github/workflows/test-file-size-check.yml`). Check locally with
`npm run validate:test-file-sizes`.

**Line count is a trigger, not a reason.** A 600-line suite covering one function
coherently is better left alone than split into four files that all import the same
mocks. Split when the file has stopped being about one thing — unrelated features
in one suite, or a `beforeEach` that only half the tests need.

Where the repo stands: 90 test files are over 500 lines and **none is over 750**, so
the hard limit is satisfied and the rest is judgement rather than a queue to work
through.

## Extract the shared setup FIRST

Create `<name>.testUtils.ts` before moving any tests, and commit that separately —
it is the step that is easy to roll back.

It holds `jest.mock` calls, mock factories, fixture builders, and a `setupMocks()`
that returns the mocks as a structured object. It holds **no assertions**: utilities
are for arranging, and an `expect()` in there hides a failure behind the wrong file
name.

`tests/core/state/stateManager.testUtils.ts` is the reference.

## The trap that makes a split fail — read this before splitting a webview suite

`babel-plugin-jest-hoist` lifts `jest.mock` above the imports **of the module it
appears in**, not across modules. So when the preamble moves into `.testUtils.tsx`
and the spec still imports the component directly, the component can bind to **real**
Spectrum — and it fails as confusing assertion noise, never as a clear error.

**The `.testUtils` file must own the SUT import** and re-export it, or wrap it in a
`render*` helper. Specs import everything from testUtils and never reach for the
component themselves.

The `webview-test-authoring` skill carries this in full, along with the fake-timer
contract and the Spectrum mock preamble. Invoke it rather than working from memory —
this section exists because the playbook used to send people into that failure
without mentioning it at all.

## Then split

One file per responsibility, named `<component>-<responsibility>.test.ts`. Move whole
`describe()` blocks; import shared setup from testUtils; delete the original once the
pieces pass.

**Keep the test count identical across the split.** That is the check that the move
lost nothing — a dropped `describe` is invisible in a green run otherwise.

## Before calling it done

- Every new file under 500 lines.
- The suite passes, and the total test count matches what you started with.
- No `jest.mock` duplicated across the split files — if it is, it belongs in
  testUtils.
- Utilities shared by two *different* testUtils files belong in `tests/helpers/`.
- Imports use path aliases, not relative paths into `src/`.

Then run `gate`.

## A real example

`dashboardHandlers` began as one 792-line suite and is now a testUtils file plus
thirteen focused ones — `-deployMesh`, `-lifecycle`, `-republish`, `-switchOrg` and
so on, each named for the handler group it covers.

It is worth looking at precisely because it kept growing after the split: the
pattern's value is that adding a handler adds a small file rather than another
hundred lines to a file nobody wants to open. `stalenessDetector` went the same way,
from one 925-line suite to eight.

## Related

- [`../../tests/README.md`](../../tests/README.md) — organisation, running, and the
  rules about what a test must actually constrain
- `webview-test-authoring` skill — the hoisting mechanics above, in full
- [ADR-016](../architecture/adr/016-test-strategy.md) — the three-tier strategy
