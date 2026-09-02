# Tests

Tests mirror `src/`, named after their source file:
`src/core/shell/pollingService.ts` is covered by
`tests/core/shell/pollingService.test.ts`.

Run `ls tests/` for the current layout rather than trusting a tree here — the tree
this file used to carry is what went stale.

The mirror is now literal for the shared webview UI too: the 38 suites that lived in
`tests/webview-ui/shared/` moved to `tests/core/ui/` on 2026-09-02, beside every
other test of that source directory.

## Safe to run with an Extension Dev Host open — but only since 2026-08-10

Two suites call the real `activate()`, which starts the in-extension MCP server. Its
socket path derives from the projects directory, and the default projects directory
hashes to the *exact* socket a live Dev Host binds — so `npx jest` used to rename its
own socket over yours and kill the running MCP session.

`tests/setup/node.ts` now points every worker at an isolated socket tree via
`DEMO_BUILDER_MCP_SOCKET_DIR`. **Do not remove that.** Nothing else keeps a test run
off the live socket, and from the test's side the failure is completely silent.

## Two projects, and which one runs your file

| Project | Environment | Matches |
|---|---|---|
| `node` | node | `**/tests/**/*.test.ts`, minus anything under `tests/core/ui/` |
| `react` | jsdom | `tests/core/ui/**` (`.ts` and `.tsx`), `tests/features/**/*.test.tsx`, `src/features/**/*.test.tsx` |

**The whole `tests/core/ui` subtree is React**, `.ts` files included — the hooks and
the utilities the components call, not only the components. That is why the node
project excludes the directory rather than an extension.

**A React test does not only live there.** Most sit beside their feature's other
tests in `tests/features/**`, which the react project matches by `.tsx` extension.
If you hit `ReferenceError: document is not defined`, the file is being picked up by
the node project: check the extension is `.tsx` or the path is under `tests/core/ui`.

**Under jsdom, `window` is real — stub onto it, never over it.** `global.window = {...}`
does nothing there, silently; the WebviewClient suite carried that line and only worked
while it ran under node. Assign the property you need and spy on the listener.

```bash
npm test                                  # everything
npm test -- --selectProjects node         # extension backend only
npm test -- --selectProjects react        # webview UI only
npm test -- tests/core/                   # one directory
npm test -- --listTests                   # what jest actually discovered
```

**Never pipe jest through `tail`/`head`/`grep`** — output buffering makes the run
look hung. Redirect to a file and read that. A PreToolUse hook blocks it. The
redirect order matters too: `> file 2>&1`, never `2>&1 > file`, because jest writes
results to stderr and the wrong order lands an empty file that reads as a clean pass.

### Narrower runs, and what each actually changes

| Script | Flags it adds | For |
|---|---|---|
| `test:watch` | `--watch` | the TDD loop — the fastest feedback there is |
| `test:file` | `--maxWorkers=1` | one file, without paying for worker startup |
| `test:changed` | `--onlyChanged` | what your working tree touched |
| `test:fast` | `--maxWorkers=75% --forceExit` | a full run tuned for wall clock |
| `test:safe` | `--maxWorkers=1`, 1GB heap | a machine that is already struggling |

All of them raise the heap except `test:safe`, which deliberately lowers it.

**The full suite takes about 20 seconds**, so reach for these to stay in flow rather
than to avoid a slow run. Figures of 3–5 minutes belong to a build long since tuned
away; a stale one teaches you to walk away from a run that has already finished.
`npm test` is the slowest of them, because its `pretest` compiles and lints first.

## Control the test, not just the code

**A test that passes against the disabled feature tests nothing.** After writing a
test for new behaviour, neuter the behaviour — return early, flip the condition, swap
the order — and confirm the test fails. If it still passes, it is not covering what
its name claims.

**Assert the observable ACT, not just a result flag.** Flags like `success: false` or
an empty array are frequently satisfied by the code doing nothing at all. A rollback
test asserting `rolledBack === true` and `moved === []` passed against a rollback that
had been deliberately switched off; it only discriminated once it asserted the
restoring deploy had actually been issued. Where order is the guarantee, assert the
SEQUENCE — an order-blind test passes against the data-losing order.

Two real examples of what this catches:

- `storefrontSetupHandlers-githubAppCheck.test.ts` defines the values it asserts on
  inside the test (`const shouldCheckGitHubApp = useExistingRepo;`), so it exercises
  no production code at all. It has been present since 2026-03-24 and passed
  unchanged through a change that relocated the behaviour it names.
- Neutering a guard is how you learn the guard's tests are real. Every guard added on
  2026-08-06/07 was control-tested this way, and two turned out to need stronger
  assertions.

## Prefer an injection seam over mocking a config leaf

When code reads a bundled JSON leaf (`demo-packages.json`, `stacks.json`, or a thin
loader over one), give the function an optional parameter defaulting to the bundled
data — `getPackageById(id, packages = bundled)` — rather than `jest.mock`-ing the
module.

Production callers are unaffected because they take the default. Tests of **logic**
inject a small fixture and stay green when the shipped config changes; tests of the
**shipped config itself** call with the default and assert on real data, in a clearly
separated block.

Reference seams: `src/features/components/services/demoPackageLoader.ts` and
`src/features/eds/services/reset/edsResetParams.ts`. Worked split:
`tests/features/project-creation/ui/helpers/demoPackageLoader.test.ts`.

Reach for `jest.mock` when there is no reasonable seam — a network or service
collaborator, not a static config leaf.

## Derive mocks from the real JSON

A mock of a config file must be derived from that file's actual structure, because a
mock carrying the old shape passes while runtime fails. That is not hypothetical: a
past migration shipped exactly that way.

Three things keep it honest:

- Shared mock data lives in `testUtils.ts` files, not re-invented per suite.
- `tests/templates/type-json-alignment-prereqs-logging.test.ts` and
  `type-json-alignment-stacks-components.test.ts` catch type/JSON drift.
- `ComponentRegistryManager-mockValidation.test.ts` validates mock structure against
  the registry.

Adding a JSON field means adding it to the mock **and** to the matching
`type-json-alignment-*` test.

## File size

500 lines is the recommended ceiling; eslint warns there and errors at 750, and CI
blocks a merge past 750 (`.github/workflows/test-file-size-check.yml`). Check locally
with `npm run validate:test-file-sizes`; exclusions go in `.testfilesizerc.json`,
sparingly.

The limits live in `eslint.config.mjs` — this repo uses flat config, so there is no
`.eslintrc.json` to edit.

When a suite outgrows it, see the
[splitting playbook](../docs/testing/test-file-splitting-playbook.md). Keep the test
count identical across a split, and remember that `.testUtils` files are shared by
the halves — one stale mock there fails several files at once.

## Credentials in fixtures

Test fixtures must **never** contain realistic-looking credentials. Secret scanners
flag a `password:` with a real-looking value as an incident, which blocks CI and has
to be triaged by hand even though the value is fake.

Use obvious non-secrets — `'test-user'`, `'fake-test-pw-not-a-secret'` — or the
shared `tests/helpers/testCredentials.ts`. `.gitguardian.yaml` and the GitGuardian
App both exclude test paths, but the convention is the real safeguard: do not create
the noise. `.pre-commit-config.yaml` carries an opt-in `ggshield` hook that catches
genuine secrets locally (`pip install pre-commit && pre-commit install`).

## The worker "failed to exit gracefully" warning is not a leak

Full runs intermittently print `A worker process has failed to exit gracefully`.
**Diagnosed 2026-08-23: not a test leak** — it is jest-worker's hardcoded 500ms
end-of-run deadline racing twelve simultaneous worker teardowns. Every suite was
audited for leaked handles; the two real leaks found (tests making live network
calls) are fixed.

Do not hunt a leak on sight of the warning.
[`docs/testing/jest-force-exit.md`](../docs/testing/jest-force-exit.md) carries the
diagnosis and the one-run audit recipe that settles whether a NEW leak exists.

`--forceExit` is passed by the `test*` scripts so the main process never hangs.

## Related

- [`../docs/testing/test-file-splitting-playbook.md`](../docs/testing/test-file-splitting-playbook.md)
- `webview-test-authoring` skill — the fake-timer contract, the Spectrum mock
  preamble, and the hoisting trap that makes a split suite bind to real Spectrum
- [ADR-016](../docs/architecture/adr/016-test-strategy.md) — the three-tier strategy
