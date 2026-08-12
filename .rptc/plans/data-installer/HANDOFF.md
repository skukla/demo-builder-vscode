# Data Installer — start here

Read this, then [`overview.md`](overview.md) for the design and the verified API contract.

## Where the work is

```
worktree   demo-builder-vscode.worktrees/feature/data-installer
branch     feature/data-installer   (8 commits ahead of develop at handoff)
```

**Work in the worktree, not the main checkout.** Both exist and they are different
directories. The previous session edited the main checkout by mistake once — absolute paths
default to wherever a file was first created — and only noticed because a commit came out one
file short. `git -C <worktree> rev-parse --show-toplevel` before trusting a path.

## First three commands

```bash
cd <repo>.worktrees/feature/data-installer
git fetch origin && git -C . rebase origin/develop   # develop moved 8+ times in one day
npx jest --no-coverage tests/features/data-installer > /tmp/j.txt 2>&1   # never pipe jest
```

Expect **7 suites / 160 tests** green. Another agent is active on `develop`; rebase before
each commit, not after. Their work has been entirely in `src/features/eds/` so far, so
rebases have been clean — verify rather than assume.

## What is done

Stage 1 steps 1–9 plus the catalog-shaping half of 10:

| Commit | What |
|---|---|
| `22982c41` | 15 sanitized fixtures captured from the live API |
| `2b4790d3` | settings read + error taxonomy |
| `8c129a9c` | wire→domain containment layer (the parsers) |
| `e3582e26` | read client |
| `2b8ee9ea` | handler map (6 read types) + access guard |
| `1e61d700` | panel command + esbuild/package.json/commandManager wiring |
| `e4df996b` | `Drawer` promoted to `core/ui` |
| `e1461a66` | catalog grouping + version ordering |

**The panel opens.** `Cmd+Shift+P` → "Demo Builder: Open Data Installer" reaches the live
service and reports connectivity.

## Next action

**Step 10b — the catalog UI.** In order:

1. `ui/components/DatapackCard.tsx` — image card. Cover → thumbnail → CSS letter tile via
   `onError`. **Nothing in the repo renders an image**, so this is the one genuinely new
   component; the fallback is the common path (15 of 23 curated packs have no cover). Version
   `Picker` inside the card, defaulted via `pickDefaultVersion`.
2. `ui/components/ViewSwitcher.tsx` — ~30 lines over `ActionButton`. Not `StepRail`
   (forward-only by design), not Spectrum `Tabs` (used in **0** files).
3. `ui/views/DatapackCatalogView.tsx` — `SearchHeader` + `GridLayout` + `useSearchFilter`,
   community toggle via Spectrum `Switch` (used in 5 files), `LoadingDisplay` /
   `StatusDisplay` / `EmptyState` for the states.
4. Rewire `DataInstallerScreen.tsx` to host views instead of the connectivity line.

Both new components stay **feature-local** until a second consumer exists.

Then 11 (detail drawer + installed + activity), 12 (six MCP read rows + doc sync), 13 (`gate`).

## Process this repo actually enforces

- **TDD, tests first.** Write the test, run it, confirm it fails, and confirm **no `src` file
  was touched** during RED. Every commit here did that.
- **Invoke skills, don't reproduce them.** `gate` (its §6 whole-repo lint is what CI runs),
  `reuse-first` (a hook blocks a new UI component until you do), `webview-test-authoring`,
  `spectrum-webview-ui`. Hand-running the steps skips rules in the body.
- **Never commit without asking.** Show the message first.
- **No `Co-Authored-By`** (project convention overrides the global default).
- **Never pipe jest** through `tail`/`head`/`grep` — a hook blocks it.

## Traps that already cost time here

- **`tsc` catches what tests cannot.** 167 tests passed while `tsc` failed on four invented
  `ErrorCode` members. Read enum members, setting keys, and import paths **from source** —
  `getBundleUri` is in `@/core/utils/bundleUri`, not the module that exports `getWebviewHTML`.
- **The whole-repo lint is the gate CI runs.** A scoped lint reported a real `error` as a
  warning-level pass once.
- **Never rewrite `package.json` with `json.dump`.** It is 2-space; a 4-space dump produced a
  987-line diff for a 15-line change. Targeted edits only.
- **A check you don't gate on is decorative.** A leak check and a commit in the same command
  block means a non-zero result stops nothing. Assert into a variable and branch.
- **Piping into `sed`/`wc` masks the exit code**, so `|| echo "none"` never fires. Count into
  a variable instead.
- **Verify a "nothing found" with a positive control at the same scope.** `git show` on a
  rewritten object errors, and `grep -c` on empty input returns `0` — indistinguishable from a
  real negative.

## The public-repo rule, which this feature already violated once

`.rptc/` is tracked and the repo is **public**. A probe writeup reached the remote carrying a
colleague's name beside a defect in his service, a stage Runtime endpoint, and live record
ids. It took a history rewrite and a force-push to remove.

Before committing anything that touched a live endpoint, strip: **names of people**,
**internal/pre-release endpoints** (incl. Runtime namespace ids), **record identifiers**
(activation, tenant, object ids), **infrastructure names** quoted out of error text. Keep the
finding, drop the identifier. The rule is in `.rptc/CLAUDE.md` §"Live-probe writeups". Raw
captures are gitignored; the redacted writeup is what gets tracked.

Fixtures follow the same rule: **captured real, then sanitized**. Hand-written fixtures would
encode the docs' lies — one of the seven divergences was found exactly that way.

## What cannot be verified by an agent

Steps 10b–11 are visual. Tests confirm the right props reach the right components; they
cannot tell you the grid looks right or the fallback tile is legible. Every visual defect in
this codebase this month was caught by the user's screenshot, never by the agent. **When the
UI lands, the check is the user opening the panel in the Extension Dev Host** — say so rather
than reporting an unseen visual result as verified.

## Two open items owned by the user, not code

1. **A GitHub Support GC request** — force-push removed the unredacted objects from the
   branch, not from GitHub's storage; they stay fetchable by SHA until GC.
2. **A heads-up to the service owner** whose name was public for a window, which pairs with
   reporting the two genuine server-side defects found: the `batch-get-data-items` 400 when
   `data_types` is omitted, and `202`-before-validation on the async entry point.
