# Data Installer — start here

Read this, then [`overview.md`](overview.md) for the design and the verified API contract.

**Stage 1 (reads) has SHIPPED** — merged to `develop` as `a3c07420`, 14 commits,
fast-forward. **Stage 2 (import) is BUILT and has never run live** — see "Next action".

## Where the work is

```
worktree   demo-builder-vscode.worktrees/feature/data-installer
branch     feature/data-installer   (BEHIND origin/develop; local commits unpushed)
```

A peer session holds `develop`. Rebase onto it, push only this branch, and land
through them — do not push `develop` from here.

**Work in the worktree, not the main checkout.** Both exist and they are different
directories. A previous session edited the main checkout by mistake — absolute paths
default to wherever a file was first created — and only noticed because a commit came out
one file short. `git -C <worktree> rev-parse --show-toplevel` before trusting a path.

The main checkout is also on `develop` and will be behind after any push from here; `git
pull` it before touching it.

## First three commands

```bash
cd <repo>.worktrees/feature/data-installer
git fetch origin && git rebase origin/develop   # develop moves several times a day
npx jest --no-coverage tests/features/data-installer > /tmp/j.txt 2>&1   # never pipe jest
```

Expect **22 suites / 370 tests** green. Add `tests/scripts` for the drift checker
(2 more suites, 34 more tests). The descriptor rows have their own suite at
`tests/features/ai/server/readDescriptors.test.ts`.

## What is done — all of Stage 1

| Commit | What |
|---|---|
| `63fb7be3` | 15 sanitized fixtures captured from the live API |
| `974db1bd` | settings read + error taxonomy |
| `a387aac9` | wire→domain containment layer (the parsers) |
| `6ba2a897` | read client |
| `cf9202ba` | handler map (6 read types) + access guard |
| `8c3414c5` | panel command + esbuild/package.json/commandManager wiring |
| `6a00ded0` | `Drawer` promoted to `core/ui` |
| `ce03bede` | catalog grouping + version ordering |
| `1fe051e3` | catalog UI — card grid, art fallback chain, version picker |
| `5369d015` | guard test: the shipped endpoint default carries no credential |
| `d9d73151` | catalog moved into the house page layout |
| `734941ae` | detail flyout + installed + activity views |
| `a3c07420` | six MCP read tools + `docs/systems/data-installer.md` |

**The panel works end to end and has been visually confirmed by the user.** All four
surfaces render: catalog, detail flyout, installed, activity.

## Next action — verify Stage 2 against the live service

**Stage 2 is built. Not one line of it has spoken to the service.** Write client,
credential resolution, job runner, handler spine, import modal, the wiring that makes it
reachable from the detail flyout, a dry run, and reset.

Everything is unit-tested. That proves the pieces agree with each other, and nothing about
whether they agree with the API — which is the same trap that produced a "two-shape
contract" out of stage junk earlier in this feature. **Do not build Stage 3 on top of this
until an import has actually run.**

### 1. Validate without writing (do this first)

**There IS a dry-run in the UI now** — the **Validate** button beside Start in the import
modal. It runs the same guard, credentials and request body as a start and stops after the
synchronous `operation_mode: 'validate'` call; both paths build that body through one
shared `prepareImport`, so it cannot check something other than what a start would send.
It also checks the credentials first, with `get-websites-and-stores`.

`docs/systems/data-installer.md` §6 keeps the equivalent direct curl, for probing without
the extension open.

**DONE 2026-08-13 — the dry run passed live.** `get-websites-and-stores` 200, then
`operation_mode: 'validate'` 200, through the modal, with the Debug Logs lines to prove it.
That answered the auth-scope question empirically (user IMS bearer to the service; OAuth
S2S pair with `commerce.accs` scope to the instance) and proved the derived tenant id is
accepted as `commerce_instance`. The entitlement recipe — create the S2S credential,
subscribe `ACCS-REST-API` to it — is in `docs/systems/data-installer.md` §pre-flight.

### 2. DONE at the service level (2026-08-13) — the modal pass remains

Import → reset → re-verify ran live by direct service calls against a populated
instance: categories import landed 12 nodes (11 + the pack's own root), reset
removed exactly those 12, zero collateral, products untouched. Scoped-delete
semantics proven; see `docs/systems/data-installer.md` § "Reset semantics".

**DONE 2026-08-13, same day: the modal pass ran too.** Import through the UI
(per-type success, verified +12 nodes on the instance), then Reset through the UI
(verified: instance diffed byte-identical to pre-import, zero collateral). The
runner watched the delete with no changes — the seam's own test, passed. Stage 2
is verified end to end; the live session also drove six UX fixes (busy states,
centered loaders, compact success, operation-aware copy), all committed.

### 2b. The original step, kept for its cautions: one real import, on a target you own

Needs a project open (the handler requires one), its credentials resolvable, and an instance
id you have checked. There is **no cancel endpoint**: once started it runs to completion
server-side. Prefer a throwaway instance and a single small data type.

Watch for: whether the status map fills the way the runner expects, whether the grace window
is long enough for a real start, and whether `partial` ever appears.

### 3. Then reset, and import again — the reuse claim

**Reset** in the import modal removes that datapack's data from the instance
(`operation_mode: 'delete'`), so the same project can be rebuilt. It is confirm-gated: the
handler refuses without `confirm: true` and the modal arms that with a second press.

Import → reset → import is the whole reuse claim, and running it is the only thing that
proves it. Watch for: whether the same 21 `data_type`s come back terminal on a delete, and
whether a re-import after a reset behaves like a first import rather than reporting
`partial` because something survived.

### 4. Only then, Stage 3

Export reuses the runner unchanged with `operation_mode: 'export'`. **If it needs runner
changes, the Stage 2 seam was wrong** — that is the design's own falsification test, and the
cheapest review of this work available. Reset already passed that test: it needed nothing.

Export lists **18** of import's 21 `data_type`s, and only one of the three is a real gap:
`giftcards` has no export processor. `product_export` and `customers_export` are
import-side input formats, not missing exports — the `_export` suffix names the shape of
the data being read in. So that screen must say it will skip gift cards.

### Known gaps, deliberately left
- **`core/ui/Modal` renders `role="dialog"` with no accessible name.** Real a11y gap, shared
  code, touches every modal in the extension — reported, not fixed here.
- **The gate is noisy.** Run the full suite at `--maxWorkers=25%`; see
  `.rptc/backlog/2026-08-13-jest-full-suite-timeout-flake.md`.

## Process this repo actually enforces

- **TDD, tests first.** Write the test, run it, confirm it fails, and confirm **no `src`
  file was touched** during RED. Every commit here did that.
- **Invoke skills, don't reproduce them.** `gate` (its §6 whole-repo lint is what CI
  runs), `reuse-first` (a hook blocks a new UI component until you do),
  `webview-test-authoring`, `spectrum-webview-ui`, `mcp-tool-authoring`. Hand-running the
  steps skips rules in the body.
- **Never commit without asking.** Show the message first.
- **No `Co-Authored-By`** (project convention overrides the global default).
- **Never pipe jest** through `tail`/`head`/`grep` — a hook blocks it.

## Traps that already cost time here

- **Coverage is `action × parameter`, not action.** The plan enumerated every ACTION name
  and made an explicit call on each — wired, held back, or deferred. It still missed reset,
  because reset is not an action: it is `operation_mode: 'delete'` on an action the plan had
  already ticked off. The plan *used* two values of that axis (`validate`, `export`) without
  ever enumerating it. Any request field with a fixed value set gets its values listed and
  each one decided, or the next capability hides the same way. `npm run
  data-installer:drift` now fails on a mode with no recorded decision; the enumeration and
  its limits are in `docs/systems/data-installer.md`.
- **An unknown `operation_mode` answers `200` with an empty list, never a `400`.** So the
  readable signal is the COUNT, and a deliberate nonsense mode is the only thing that proves
  a count means anything. Seven guesses and the control were indistinguishable — which is
  the correct result, and unreadable without the control.
- **A handler that RETURNS `{success:false}` does not reject.** The communication manager
  puts the whole `HandlerResponse` in the response payload, and `webviewClient` rejects
  only when a handler THROWS — so a guard refusal arrives at the webview looking exactly
  like a success. The connectivity line shipped in step 9 read `data.reachable` off that
  envelope and told signed-out users "Connected". `ui/hooks/useDataInstallerRequest.ts`
  is the fix; any new view must go through it rather than `useVSCodeRequest` directly.
- **`tsc` catches what tests cannot.** 167 tests passed while `tsc` failed on four
  invented `ErrorCode` members. Read enum members, setting keys and import paths **from
  source**.
- **The whole-repo lint is the gate CI runs.** A scoped lint reported a real `error` as a
  warning-level pass once. It also blocks on WARNINGS by this project's bar, not just
  errors — two landed this way (a jsx-a11y containment warning, an import/order one).
- **Full-suite green is not scoped-suite green.** `commandManager.test.ts` pinned the
  command count at 30 and had been failing since step 9 added the panel command; the
  "gate-green" claim in the previous handoff was scoped-only.
- **Never rewrite `package.json` with `json.dump`.** It is 2-space; a 4-space dump
  produced a 987-line diff for a 15-line change. Targeted edits only.
- **A check you don't gate on is decorative**, and **piping into `sed`/`wc` masks the exit
  code**. Assert into a variable and branch.
- **Verify a "nothing found" with a positive control at the same scope.** A `-A1` grep
  window one line too short reported the endpoint default as missing when it was present.

### UI traps specific to this feature

- **The page shell is not optional.** `<PageHeader constrainWidth />` plus
  `.page-container-padded` is what puts content in the 960px `--content-width` band. Built
  without them, the catalog spanned the whole panel and its three columns rendered at
  ~517px each.
- **Card-grid metrics stay LITERAL in CSS.** `integrationsGridLayout.test.ts` guards the
  grids by parsing px values out of the stylesheet text — jsdom resolves no layout, so a
  rendering test would pass either way. Lifting them into shared custom properties **fails**
  that guard (loudly, positive control included) rather than blinding it; it was tried and
  reverted. The fix is to keep the literal, never to loosen the test.
- **`searchThreshold` is not a tuning knob.** `SearchHeader` puts the count beside the
  refresh button with no field and beneath it with one, so a non-zero value changes the
  band's shape as the list crosses it. Page-level surfaces use `0`.
- **`SearchableList` is for SELECTION**, and needs a flex parent with a resolved height.
  It is the wrong component for a read-only list on a page.
- **A Spectrum `Picker` with a static `<Item>` before a mapped array loses keys — on the
  MAPPED items, not the static one.** React namespaces the nested array, measured with
  `React.Children.toArray`: mixed gives `['.$all', '.1:$import', '.1:$export']`, one array
  gives `['.$all', '.$import', '.$export']`. The mock's `getOriginalKey` decodes `.$key`
  and `.key` only, so `.1:$import` survives as `1:$import` and selecting `import` matches
  no option. Build one array. (A peer session corrected my first write-up of this, which
  blamed the static option — the one element that works. Scoped claim: React's namespacing
  and the mock's decoder are both measured; whether REAL Spectrum's collection builder
  behaves the same is unverified — this was seen in tests, never at runtime.)
- **`Page.skip` is not reliably echoed by the service.** Key append-vs-replace on the skip
  you REQUESTED, not on the response.

## The public-repo rule

`.rptc/` is tracked and the repo is **public**. A probe writeup once reached the remote
carrying a colleague's name beside a defect in his service, a stage Runtime endpoint, and
live record ids. It took a history rewrite and a force-push to remove.

Before committing anything that touched a live endpoint, strip: **names of people**,
**record identifiers** (activation, tenant, object ids), and **infrastructure names quoted
out of error text**. Keep the finding, drop the identifier. Raw captures are gitignored;
the redacted writeup is what gets tracked. Fixtures follow the same rule: **captured real,
then sanitized** — hand-written fixtures would encode the docs' lies, and one of the seven
divergences was found exactly that way.

**Endpoints are the exception, decided deliberately.**
`demoBuilder.dataInstaller.apiBaseUrl` ships the team's stage deployment as its default,
matching `byom.overlayUrl`, `accsDiscovery.services` and `daLive.aemAuthorUrl`. Access is
gated by the caller's IMS token, not by knowing the URL. What must never ship is a
credential riding IN a URL — pinned by `dataInstallerSettingsSchema.test.ts`.

## What cannot be verified by an agent

Every UI surface. Tests confirm the right props reach the right components; they cannot
tell you the grid looks right or the fallback tile is legible. **When UI lands, the check
is the user opening the panel in the Extension Dev Host** — say so rather than reporting an
unseen visual result as verified.

MCP tools need an extension-host restart (F5), not a webview reload (Cmd+R), before Claude
Code sees them.

## Open items owned by the user, not code

1. **A GitHub Support GC request** — an earlier force-push removed unredacted objects from
   the branch, not from GitHub's storage; they stay fetchable by SHA until GC.
2. **The service-owner conversation** — blocking question 2 above, plus the two defect
   reports.
