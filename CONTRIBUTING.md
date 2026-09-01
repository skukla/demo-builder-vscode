# Contributing

## Setup

You need **VS Code 1.84 or later** (`engines.vscode` is `^1.84.0` — an older editor
will refuse to install the extension) and a current Node LTS.

```bash
git clone https://github.com/skukla/demo-builder-vscode.git
cd demo-builder-vscode
npm install
npm run compile
```

Press **F5** to launch the Extension Development Host.

While iterating, run `npm run watch:all` in the background: after that you only
reload the dev-host window with Cmd+R, and F5 is needed only when the extension host
itself must restart.

## Branches

`master` is stable and is reached only through the release process. `develop` is
where work lands. Feature work uses `feature/*`, `fix/*` or `refactor/*`.

## Before you push: `npm run gate`

One command runs everything CI checks, in order, stopping at the first failure:
whole-repo lint, `tsc` over `src/` and over the test tree, the file-set validator,
the full suite, and the dead-code scan.

```bash
npm run gate
```

Run it rather than the individual commands. The lint CI runs is **whole-repo**, so a
scoped local lint can pass while CI fails on a file you never touched — and a
sequence of six commands is a memory test that has already been failed twice here.

## Commits

**Conventional Commits**, plus a `Backlog:` trailer:

```
feat(authentication): use the Console SDK for auth checks

Replaces CLI calls with the SDK, adds a 5-minute TTL cache, and keeps the
existing auth flow working unchanged.

Backlog: none
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `style`.

**The trailer is required and git enforces it.** `Backlog: none` is a first-class
answer — most commits belong to no tracked item, and forcing a fake id would be
worse than no rule. What the rule buys is that you answered. Switch the hooks on
once per clone:

```bash
npm run hooks:git
```

Two things the hook will refuse: a trailer naming an id that does not exist, and any
`Co-Authored-By` line crediting an AI tool. A human co-author is fine.

## Code

**TypeScript strict**, path aliases (`@/core/...`) for anything crossing a module
boundary, relative imports only within a directory. Prettier owns formatting at 100
columns — run `npm run format`, and do not hand-tune whitespace.

Prefer `unknown` plus a type guard over `any`. A cast at a call boundary is a
silenced type error, and it has hidden four real defects here: each produced a silent
no-op in production that every test agreed with.

Where code goes, and the conventions the build enforces, are in
[the handbook](docs/development/handbook.md) — 74 of them, 73 with an enforcer.
Read it once.

## Tests

Tests mirror `src/` under `tests/`, named after their source file. TDD is the
expected rhythm: a failing test, the smallest code that passes it, then refactor.

Coverage is gated at 80% for branches and statements. Test files warn at 500 lines
and CI blocks a merge past 750.

The rule that matters most is not size, though — **a test that passes against the
disabled feature tests nothing.** After writing one, break the behaviour it covers
and confirm it fails. [`tests/README.md`](tests/README.md) explains why, with two
cases where that check found tests asserting nothing.

## Pull requests

- `npm run gate` passes
- new behaviour has a test, and you have watched that test fail
- no `console.log` or `debugger` left behind
- documentation updated when behaviour changed

Describe **what problem this solves** before what you changed. A reviewer who has to
reconstruct the intent from a file list is doing your work.

## Where to look

| | |
|---|---|
| [`docs/development/handbook.md`](docs/development/handbook.md) | every convention, and which are enforced |
| [`CLAUDE.md`](CLAUDE.md) | what this extension never compromises on, and the words it uses |
| [`docs/architecture/overview.md`](docs/architecture/overview.md) | how the pieces fit |
| [`tests/README.md`](tests/README.md) | testing in depth |

Questions: open an issue.
