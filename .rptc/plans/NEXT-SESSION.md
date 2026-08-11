# Next session — start here

Rewritten 2026-08-11. **Everything is committed AND PUSHED — `develop` is level with
`origin/develop` at `d33181fe`.**
Gate at handoff: **962 suites / 12228 tests**, whole-repo eslint (0 errors, 0 warnings), tsc.

**The release is the only stream.** 27 commits landed since the last handoff; nothing
from this session is half-finished in the tree.

---

## C. Release `.127` — start here

Re-verified 2026-08-11, do not assume:

- **It is `.127`, not `.128`.** `package.json` reads `1.0.0-beta.127`; the newest tag is
  `v1.0.0-beta.126`. The bump came from the `.126` hotfix merge-back and was never cut.
  Do not apply the usual +1.
- **476 non-merge commits** since `v1.0.0-beta.126` (438 at the last handoff; this session
  added 27 and the rest predate it). `.126` was a hotfix off `.125` and develop diverged,
  so expect add-then-remove arcs — describe net shipped behaviour.

### Three things that MUST reach the release notes

1. **`AI_CONTEXT_VERSION` 5 → 6.** Every existing project will flag its AI bundle stale and
   prompt a regenerate. That is intended and unavoidable: the generated `PostToolUse`
   git-sync hook **never fired on any project since beta.109**, and only a regenerate
   replaces it. Users who skip the prompt keep a dead hook.
2. **AI-authored storefront edits were never reaching GitHub.** Same defect. The hook read
   a `$CLAUDE_TOOL_INPUT` env var Claude Code does not set, while the generated
   `sync-changes` skill told agents the hook handled commit+push — so agents skipped
   `sync_storefront` too. Silent at both ends. (`df4156b2`)
3. **Republishing a storefront never cleared its "Republish needed" state on disk.** The
   flag was set in memory and none of the five callers saved it, so reopening the dashboard
   showed amber again after a successful republish. (`777b81a3`)

Items 2 and 3 are the only two commits this session that change behaviour on existing
projects. Everything else is UI.

Follow the `cut-release` skill, which also says to offer `codebase-sweep` and `dream` first.

**Launch:**
```
cd /Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode
/cut-release
```

---

## `dream` has a strong, single theme this time

**A convention recorded in prose is not a constraint.** Five instances in one session,
each one a comment asserting something the code contradicted:

| Where | The comment said | The code did |
|---|---|---|
| `--content-width` docblock | "the canonical, LEFT-ALIGNED content width" | `.page-container*` centred with auto margins |
| Masthead badge markup | "a single horizontal row … instead of stacking" | CSS stacked them — **and I flattened the CSS to match the comment, which was the stale side** |
| `.integration-card` | "Matched to `.project-card-spectrum`" | identical declarations, different rendered heights |
| `formatHeaderSubtitle` | "the band is otherwise about acting on the list" | the band's left held the count, mostly empty |
| Generated git-sync hook | "if wrong, the hook silently does nothing" | it was wrong, and it did — for two releases |

The last one is the sharpest: the author predicted the failure exactly, in the file, and it
shipped anyway. A comment that admits a risk is not a mitigation.

**Second pattern: tests that pin the implementation, so they pass whatever the behaviour.**

- Three tests asserted the hook's command string *contained*
  `process.env.CLAUDE_TOOL_INPUT`. They pinned the bug. The extractor is now covered by
  tests that **execute** it against a real stdin payload.
- The integrations suite's `SearchHeader` mock rendered the filter field unconditionally,
  so `searchThreshold` was untestable and two search tests passed regardless of it. The
  mock now mirrors the real `totalCount > searchThreshold`.

Both are the same shape as the "nothing found" verifications CLAUDE.md already warns about:
a check that cannot fail for the reason you care about.

**Third, and it is about how I worked, not the code.** Three visual judgments were wrong
this session and **the user caught every one from a screenshot** — a status row that
dangled off the tile grid, a per-row hint that annotated 717 rows to explain 6, and a dot I
described in the design and then silently did not build. All three came from reasoning
about layout from CSS without seeing the surface populated. Check a list's real cardinality
before designing per-row anything.

---

## What landed this session (27 commits)

Four arcs. Nothing outstanding behind any of them.

### Configure field regrouping
`e4014759` `2dff9961` `663580ba` `63bdb448` `d3c609fa` + research/plan docs

API Mesh tab dropped; Commerce tab split into **Connection** and **Business Structure**;
a real PaaS deadlock fixed (required Catalog fields sat in a step locked by a whole-form
verdict that included those fields). The splitter's `connection` predicate is a **negation**
(`!isStoreCodeField`), so no field can be orphaned — `ADOBE_COMMERCE_ADMIN_URL` had been
rendering nowhere.

Plan `configure-commerce-subsections/` is fully shipped and should move to
`.rptc/complete/`. **Not moved** — housekeeping left for the release session.

### Status model
`f62059bf` `a8002632` `271157be` `88b170c8`

Project cards carry **two lines, one per axis**: runtime (local dev server) and deployment
(worst-of mesh + storefront + integrations). The per-component mesh line and integration
count are gone — the card answers "is what is deployed current?", detail lives on the
integrations dashboard.

The dashboard's rule, documented at the top of `ActionGrid.tsx`: **environment health →
the masthead band; artifact state → the zone that owns the part**, as a *remedy tile* (the
button that fixes it, dotted when due, tooltip saying why). `DashboardTile` makes the
dot/tooltip pairing structural — `status` carries both in one object, so a dot with no
explanation is unrepresentable.

`restartDemo` is new: "Restart needed" had no fix anywhere before.

### The two bug fixes
`df4156b2` `777b81a3` — see the release-notes section above.

### Layout consistency
`1feb4a85` `88b170c8` `218e768e` `8e15ac32` `1f304fa8` `d33181fe`

Left-alignment is now the **default** (`.page-container*` no longer centre) rather than a
per-screen opt-out; `.page-left-anchored` / `.dashboard-left` are deleted. Body inset moved
16px → size-400 to line up with the page title, which had never matched on any screen that
did not override it.

Integrations now mirrors the dashboard: three-column grid, shared `--card-*` metrics, one
add affordance (the grid tile is gone), and the filter field shows from the first item.

The deploy destination left the header crumb — where the LOCAL project name and the REMOTE
Adobe project/workspace sat in one dot-run with nothing telling them apart — and now rides
the end of `SearchHeader`'s count row through a new `countTrailing` slot:

```
[Filter integrations…] [⟳]      [Project Dashboard] [Add integration]
2 integrations          Deploys to Kukla Mesh · Stage  Change
```

**Three placements were tried.** Its own row at the top of the band (most prominent slot
for the least-used fact); its own row below the count (same height for something that fits
in space already going spare); and this. The rejections are recorded in the placement
test's docblock so the next person does not re-run the experiment.

---

## Outstanding

Carried forward, still true:

- **`mesh-staleness-scope` step 05 — never run.** Flip `componentConfigs` key order in a
  manifest and confirm the staleness verdict is order-independent. The only check that
  exercises the original defect on real data; the code is committed and unit-tested. Plan
  stays in `.rptc/plans/` for that reason.
- **Missing `get_store_structure` MCP tool** — PDP handoff §3, still the highest-value gap.
  An agent debugging PDP failures cannot see that a project points at a Commerce website
  with no products.
- **Duplicated Commerce scope still in existing manifests.** All three resolvers consult
  `BACKEND_OWNED_SCOPE_KEYS` via `backendOwnedScope.ts`, so verdicts no longer turn on key
  order. **What remains is the DATA MODEL** — a migration dropping the duplicate copies
  would dissolve the bug class. PDP handoff §2.
- **`pickSampleSku` reads the project manifest**, not the storefront's served `config.json`.
  Recorded as intended and never made.

New this session:

- **`.dest-context` is 12.5px — off the type scale**, which nothing else uses. Scoped to
  12px inside the integrations destination row; the add-integration modal renders the same
  component and still gets 12.5px. Fixing it there is a real cleanup on a surface this
  change never looked at.
- **`who_created: 'Demo Builder'` is dead weight** (`adobeEntityFetcher.ts:908`). Adobe
  overwrites it with the authenticated user's IMS id — inferred from the fact that
  Demo-Builder-created projects are deletable by their creator, not confirmed against the
  API. Cosmetic; fold into the next edit of that file.
  Full research: `.rptc/research/adobe-project-ownership/research.md`, which also records
  the decision to **keep** the ownership gate rather than widen it to whatever Adobe
  permits, and that a per-row "why can't I delete this" hint was built and rejected.
- **Four suites flake under parallel load** — `extension-context`, both
  `inExtensionMcpServer` suites, and `mcpConfigWriter`. All four passed in isolation and the
  full suite passed clean on a second run. They are the slowest suites (11–13s) and bind
  sockets, so it reads as contention, not a defect. Not investigated. Expect it in CI.

---

## Read before trusting any narrative here

`.rptc/plans/pdp-prerender-validation/HANDOFF.md` §3 lists five things stated confidently
during that session that were wrong, and §6 lists where to recheck.

This session held the "positive control on every nothing-found" rule and it earned its
keep: a `grep` that reported three skills lacking coverage they had, a zsh glob that made
`grep` never run while printing `0 remaining`, and — this session — a claim that
`getStorefrontStatusText` was dead when `getProjectStatusDisplay` used it, caught because
the grep had excluded the defining file. Assume the same rate applies to anything here that
is not marked verified.
