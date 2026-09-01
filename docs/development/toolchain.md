# The development toolchain

Every tool this repo can run, what question each one answers, and the trap each one
carries. Written so an orchestration can be assembled from it without guessing.

**Two catalogs already existed and neither covers this.**
[`docs/systems/mcp-tools.md`](../systems/mcp-tools.md) lists the 114 MCP tools the
extension exposes to agents; `tests/sop/toolingRegistry.ts` lists the quality
instruments — scans, enforcer suites, hooks. Neither says which tool to reach for
when you need to change 500 files safely, which is the gap that produced a day of
corrupted refactors on 2026-09-01.

**The rule this page exists to serve: never hand-roll a check a tool already
performs.** Every regex-based converter written that day failed, and all of them
failed the same way — text cannot tell code from a string literal or a comment. The
tools below parse. Reach for one before writing a script.

---

## The three oracles

Most orchestration is these three, in this order. Each answers what the previous
cannot, and running them out of order wastes the cheap answers.

| | Tool | Answers | Blind to |
|---|---|---|---|
| 1 | `tsc` | is this type actually satisfied? | anything about behaviour |
| 2 | `jest` | did behaviour survive? | whether the test still means anything |
| 3 | reading | is the residue right? | — |

`ask-the-tool` (skill) is the procedure that uses them. Do not skip to 3: 1 and 2
shrink the pile before you read it.

---

## Type checking — `typescript` 5.9

Two configs, and BOTH must run. They cover different file sets.

```bash
npx tsc --noEmit              # src/ — tsconfig.json EXCLUDES tests
npm run typecheck:tests       # tests/ — tsconfig.test.json
npm run validate:tsc-blindspots   # files BOTH configs silently skip
```

**The trap.** `tsc` keeps one file per basename, so an `index.tsx` beside an
`index.ts` is never typechecked, and nothing says so. That hid a dead wire read in
the dashboard entry for months, which is why the dashboard entry is `main.tsx` and
why the blindspot validator exists. Run it whenever the file set changes.

**As an oracle, it is whole-tree and cheap.** One run answers "which of these 300
edits was load-bearing" — that is the entire economy of the `ask-the-tool` method.

**Save its raw output.** A script that computes a verdict and discards the compiler
output cannot be debugged. One did exactly that on 2026-09-01: it reported ONE
broken file when 115 were broken, and the cause is permanently unknowable.

---

## Linting — `eslint` 9 + `typescript-eslint` 8

**Two modes, and the difference matters more than anything else on this page.**

### Default: fast, untyped

```bash
npm run lint     # eslint "src/**/*.{ts,tsx}" "tests/**/*.{ts,tsx}"
```

`eslint.config.mjs` extends `tseslint.configs.recommended` — the config comments
say "Basic TS rules, not type-checked". Correct for a per-push gate: no TypeScript
program is built, so it is fast. It also means every rule that needs to reason
about a TYPE is switched off.

### Ad-hoc: type-aware, for refactors

```bash
npx eslint --config eslint.casts.mjs tests/ --fix
```

`eslint.casts.mjs` turns on `recommendedTypeChecked` scoped to one rule. This is
where `no-unnecessary-type-assertion` lives — it asks the type checker whether an
assertion changes anything, and auto-fixes the ones that do not. It found 36
unnecessary casts in a single feature directory.

**Trap 1 — `projectService: true` is the documented best practice and is wrong
here.** typescript-eslint v8 recommends it, and measured on this repo it took a
directory from **4 seconds to over 10 minutes** (killed, never finished). It
resolves a project per file through the TS language service: right for an editor,
wrong for a repo with 1,200 test files already listed in one tsconfig. Use
`project: './tsconfig.test.json'`. Never set both — that is a hard parser error.

**Trap 2 — the autofix is not blindly safe.** On
`jest.requireMock('vscode') as { commands: … }` the rule is technically right
(asserting from `any` never errors) and its fix is a REGRESSION: the assertion was
the only type information in the expression, and removing it yields `any`. Review
the diff; do not run `--fix` repo-wide and commit it.

**What it cannot do wrong:** touch a string or a comment. It operates on the syntax
tree. Verified by diffing a `--fix` run.

### Driving cleanup FROM eslint

`-f json` gives machine-readable `(file, rule, symbol)` from a real parse:

```bash
npx eslint "tests/**/*.ts" -f json > "$SCRATCH/lint.json" 2>/dev/null
```

Use it for dead-import removal after any conversion — that is a fixed step, needed
four times in one session before it was accepted as routine. Handle all four import
shapes; a cleaner that knew only the first two left real errors behind:

```
import type { X } from '…';           import type { A, X, B } from '…';
import * as vscode from 'vscode';     import type * as vscode from 'vscode';
```

---

## Codemods — `ts-morph`

**Not currently a declared dependency.** It sits in `node_modules` transitively and
nothing here imports it. Adopting it is a deliberate `npm i -D ts-morph`, not a
freebie.

It is the right tool for any transformation the lint rules do not cover, because it
is the TypeScript compiler API with a usable wrapper. Verified against the installed
copy on 2026-09-01:

```js
import { Project, SyntaxKind } from 'ts-morph';
const project = new Project({ tsConfigFilePath: 'tsconfig.test.json' });
const file = project.getSourceFileOrThrow('tests/x.test.ts');
for (const cast of file.getDescendantsOfKind(SyntaxKind.AsExpression)) {
    cast.getTypeNode()?.getText();                 // 'any' | 'never' | 'Project' …
    cast.getParent()?.getKind();                   // CallExpression => argument position
    cast.replaceWithText(cast.getExpression().getText());   // drop the cast only
}
file.saveSync();
```

**Why it beats every script written on 2026-09-01**, proved rather than asserted: a
probe file containing a cast in code, a cast inside a string literal, and a cast
inside a comment yielded exactly TWO `AsExpression` nodes — the real ones. The
string and the comment were untouched. It also reports the parent node kind, so
"argument position" is a fact rather than a regex guess.

**Alternatives not adopted**, and why: `jscodeshift` and `ast-grep` are equally
AST-safe, but neither is installed and neither carries TypeScript *type* information
the way ts-morph does. Prefer ts-morph here for that reason alone.

---

## Tests — `jest` 30 + `@swc/jest`

```bash
npx jest --no-coverage                  # everything
npx jest --selectProjects react         # jsdom only
npx jest --selectProjects node          # extension host only
npm run test:changed                    # --onlyChanged
npm run test:coverage                   # gated at 80% branches/statements
```

**Never pipe jest through `tail`/`head`/`grep`** — output buffering makes it look
hung. Redirect to a file. Enforced by `.claude/hooks/rules/10-jest-pipe.rule`.

**Redirect order matters**: `> file 2>&1`, never `2>&1 > file`. The wrong order
leaves the file EMPTY and every `grep -c FAIL` on it returns a clean-looking 0.

**`@swc/jest` strips types without checking them.** That is why `typecheck:tests`
exists: without it nothing typechecks the test tree, and fixtures invent shapes the
suite then agrees with.

**As an oracle it catches what tsc cannot.** In one conversion, 28 files passed the
compiler and 4 of those then failed their tests — the literals carried a stateful
`globalState` and a path an assertion read back. Type-correct is not
behaviour-preserving.

---

## Mutation testing — `stryker` 9

```bash
npm run test:mutation           # full — hours
npm run test:mutation:sample    # the pinned module sample
npm run test:mutation:baseline  # write the baseline
```

The only instrument that measures whether a test would CATCH a defect rather than
merely execute the line. Everything else here proves code runs; this proves the
tests are worth passing. See the `mutation-test-pilot` skill for what the numbers
mean — the score falls almost monotonically as `await` count rises, so async
mocked code is the hard case, not the careless one.

---

## Structural scans

| Tool | Question | Run |
|---|---|---|
| `jscpd` | copy-paste duplication | `bash .claude/skills/code-duplication-scan/scan.sh` |
| `madge` | import cycles | `bash .claude/skills/circular-dependency-scan/scan.sh src` |
| `ts-prune` | unused exports | `bash .claude/skills/dead-code-scan/scan.sh src` |
| `cloc` | size census | via `scripts/healthSnapshot.mjs` |

All three are ADVISORY. `ts-prune` reports entry points and DI-registered symbols as
unused; read it, do not obey it. Their numbers feed
`npm run health` / `health:write`, which appends a reading to
`reports/health/history.json` — a time series, never a target.

---

## Formatting — `prettier` 3

```bash
npm run format          # write
npm run format:check    # verify
```

100 columns, and it owns whitespace. Do not hand-tune formatting; `eslint-config-prettier`
turns off every rule that would fight it. A PostToolUse hook formats on edit, which
can invalidate a read you are mid-edit against — re-Read rather than re-deriving the
string from memory.

---

## Build — `esbuild`

```bash
npm run compile         # production, extension + 8 webview bundles
npm run watch:all       # background during iteration; then Cmd+R in the dev host
npm run package         # vsce package
```

NOT webpack. `esbuild.config.js` owns `WEBVIEW_ENTRIES`, which is the authoritative
list of the eight bundles — a feature stylesheet reaches only the bundles whose
entry imports it. Extension-host changes need F5; webview changes need only Cmd+R.

---

## Generators — the anti-rot layer

Every hand-maintained list in this repo has rotted, so the enumerable ones are
generated and checked in CI.

```bash
npm run docs:conventions    # docs/development/conventions.md  (+ :check)
npm run docs:adr-index      # the ADR table               (+ :check)
npm run docs:tools          # docs/systems/mcp-tools.md    (+ :check)
```

The pattern to copy when adding one: write the file, add a `--check` mode, and have
a test call it. A generator nobody runs rots exactly like the list it replaced.

---

## The trustworthy workflow

For any change repeating across more than ~10 sites:

1. **Pick an AST tool, not a regex.** `no-unnecessary-type-assertion` if the
   question is "is this cast doing anything"; ts-morph if the transformation is
   custom. If you are about to write `re.sub` over source, stop.
2. **Back up every file first.** The method depends on cheap restoration.
3. **Apply broadly**, without pre-filtering by judgement — that is the thing being
   replaced.
4. **Ask tsc once**, and SAVE ITS OUTPUT. Files that error are load-bearing.
5. **Restore along the import graph, not the error list.** A stripped shared helper
   errors in its CONSUMERS; restoring only the files named in the errors never
   converges.
6. **Loop until the answer stops changing.** One pass reported 1 broken file when
   115 were broken.
7. **Run the suite.** Restore what fails.
8. **Sweep dead imports from eslint's own report.**
9. **Re-pin every ratchet in the same commit** — the enforcers demand exact
   equality, and that failure is the ratchet working.
10. **Verify nothing got weaker**: diff the `it()` names and `expect()` counts
    before and after. A green suite cannot tell you a test stopped asserting.

**Two things never to do in shell:** counting and comparison. Every silent zero on
2026-09-01 came from there — `grep -c … || echo 0` capturing `"0\n0"`, a `$VAR` that
zsh refused to word-split, a `[^|\n]` that excluded the letter *n*. Write it in
Python and give it a positive control. Three hook rules now block the specific
shapes; the habit is what stops the fourth.

---

## Related

- [`handbook.md`](handbook.md) — the conventions themselves, and which are enforced
- `.claude/skills/ask-the-tool/SKILL.md` — the procedure, with its safety rules
- `tests/sop/toolingRegistry.ts` — the quality instruments and their cadences
- [`../systems/mcp-tools.md`](../systems/mcp-tools.md) — the agent-facing tool catalog
