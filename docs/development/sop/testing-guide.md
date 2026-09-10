# Testing

[`tests/README.md`](../../../tests/README.md) is the handbook — organisation, naming,
how to write a suite. This file is the two project-specific things that are easy to
get wrong.

## Do not mock a config leaf

When code reads a bundled JSON registry — `demo-packages.json`, `stacks.json`,
`components.json`, `block-libraries.json`, all under
`src/features/components/config/` — **inject the data instead of mocking the module.**

```typescript
// ❌ mocks the JSON module: brittle, hidden coupling, leaks across suites
jest.mock('@/features/components/config/demo-packages.json', () => ({ packages: [] }));

// ✅ an optional parameter defaulting to the bundled data
export async function getPackageById(
    packageId: string,
    packages: DemoPackage[] = bundledPackages,
): Promise<DemoPackage | undefined> { /* … */ }

// the test hands in a fixture and stays stable across config edits
expect(await getPackageById('alpha', makeTestPackages())).toBeDefined();
```

Mocking the leaf means the test checks the mock rather than the shipped
configuration, and a real change to the registry cannot fail it. Enforced by
`tests/sop/no-config-leaf-mocks.test.ts`, which flags any `jest.mock()` of a path
under a `config/` directory ending in `.json`.

The trap this leaves open: a loader like `getAppBuilderComponentEntry` reads the
**bundled** JSON, not whatever catalog a test passes as a prop. A fixture id that
looks catalog-ish is therefore not one — use a real id from the shipped file when the
behaviour depends on catalog membership.

## Running them

```bash
npx jest --no-coverage > "$SCRATCH/jest-output.txt" 2>&1   # full suite, ~20s
npm run test:file -- <path>                                # one file
npm run test:watch -- <path>                               # TDD loop
```

Three rules, all enforced by hook rules because all three have cost real time:

- **Never pipe jest through `tail`/`head`/`grep`.** Output buffering makes a finished
  run look hung for minutes.
- **`> file 2>&1`, never `2>&1 > file`.** Jest writes results to stderr; the wrong
  order leaves the file empty and a `grep -c FAIL` on it returns a clean-looking `0`.
- **Never run two jest runs at once.** Measured: one at a time failed 0 suites in 10
  runs; two concurrently failed 4–6 suites in all 6 runs, in different suites each
  time. A concurrent result is noise in both directions.

`npm test` is the slow one — its `pretest` compiles and lints first.

## Related

- [`webview-test-authoring`](../../../.claude/skills/webview-test-authoring/SKILL.md)
  — the fake-timer contract and Spectrum mock preamble
- [ADR-016](../../architecture/adr/016-test-strategy.md) — the three tiers
