---
id: PL-29
kind: epic
area: platform
parent: PL-30
needs: []
value: high
status: active
---

# Track 2 — documentation synthesis, and every document enforced

The owner's standard, stated verbatim: *"Every piece of documentation must earn its
keep. It must be concisely communicated. It must be easy for a human to read and
understand. It must be useful. And it must be enforced."*

Three phases. The third was added 2026-08-30 and is the one that makes the other two
stick.

## Phase A — assess and rewrite every document

Read start to finish, verify every claim against source, keep only what a reader
cannot get from the code, and record any rule stated as law in [[PL-28]] rather than
deciding about it mid-pass.

**Done (7):** `src/commands`, `src/core`, `src/features`, `src/features/sidebar`,
`src/features/projects-dashboard` — rewritten, 2,388 → 893 lines. `src/core/ui/hooks`
and `src/core/ui/components` — verified accurate, kept essentially as written, which
is a finding in itself: the bar is passable.

**Done (13 total):** the seven above plus `tests/README.md`,
`docs/systems/mcp-server.md` (kept at 652 — two sections re-placed, nothing cut),
`docs/development/styling-guide.md`, `docs/testing/test-file-splitting-playbook.md`,
`CONTRIBUTING.md`, and both `docs/troubleshooting/` guides. 5,281 → 2,090 lines.

**MISSED, and the "Phase A complete" claim was wrong (4 files, 606 lines):**
`src/CLAUDE.md` (244), `docs/CLAUDE.md` (124), `docs/architecture/CLAUDE.md` (103),
`.rptc/CLAUDE.md` (135).

Each was *edited* during the pass — a stamp removed, a dead link fixed — and never
*read through*. Found on 2026-08-30 by measuring description-vs-instruction across
the per-directory files: `src/CLAUDE.md` came back at 20% description against 0–10%
for the seven that had been done, which is what a file looks like when nobody has
read it.

The check that produced the wrong "all assessed" answer was `git log --since` per
file, which reports *touched*. Touched is not assessed, and nine of these were
touched by one stamp-removal commit. **The register of what has had the treatment
has to be kept by hand; git cannot answer it.**

## Phase B — a usefulness pass over everything touched

Re-read the RESULT, not the diff. Assessing a document while rewriting it is not the
same as judging the finished thing, and the owner has asked twice for the second.
Two questions per document: is every line that survived actually useful, and does its
content belong in this file under the canonical structure rather than somewhere else.

**DONE 2026-08-30.** Both open questions answered, every touched document judged, and
five defects found in documents Phase A had already passed.

### The two questions it was holding

**Do the hooks gotchas belong in a skill?** No — but the file needed rewriting anyway,
and finding that out is what the question was for. A trap about a hook in this
directory IS directory context. What did not belong was everything around it: a filler
Overview, four generic React "best practices" (one of them, rules-of-hooks, an eslint
**error** — restating a rule the build already fails on), and a `renderHook` example any
library doc gives you. Phase A had marked this file *"verified accurate and kept as
written"*, which is the finding in one line: **accurate is not the same as useful, and
Phase A's pass could not tell them apart.** 148 → 118 lines, with the one genuinely
duplicated item — the `useVSCodeRequest` refusal trap, stated in full both here and in
`webview-command-handler` — kept as the warning and pointed at the skill for the fix.

**The Rule of Three override** is [[PL-28]] row 2 and stays the owner's. Everything else
in `components/CLAUDE.md` passes: it is organised by job, says so, and its
non-enforcement was already reasoned.

### What the pass found in documents Phase A had passed

| Document | Defect |
|---|---|
| `docs/systems/mcp-server.md` §10 | Named 8 confirm-gated tools; **28** are gated. Two sections above, the same document explains why the tool CATALOG stopped being hand-maintained |
| `scripts/generate-tool-catalog.mjs` | Undercounted the gates it publishes — a fixed 600-char window dropped `confirm: true` for four tools, `set_console_apis` among them |
| `CONTRIBUTING.md` | "63 conventions, 57 enforced" — two versions stale, and the third copy of a number pinned in only two places |
| `docs/troubleshooting/adobe-cli-timeouts.md` | "`orgContextEnv.ts`, 41 files" — 39. Replaced with a statement that does not churn |
| `src/core/ui/hooks/CLAUDE.md` | The generic content above |

The mcp-server one is the worst, and not because of the arithmetic. An agent reads §10
to decide what is safe to call, so a short list of destructive tools understates the
blast radius of every tool it omits — and the generator was independently telling agents
that `set_console_apis` needed no confirmation, a tool whose own source comment calls it
"a delete wearing a setter's name".

**One near-miss worth recording.** I first concluded §10 was wrong in both directions and
that `set_console_apis` was NOT gated. It is — the `confirm: true` sat just past where my
grep window ended. Reading the source is what stopped a false finding going into a
document; a named field is a lead, not a result, and that rule earned its keep here.

### Enforcement added by this phase

- `tool-catalog-gating.test.ts` — the catalog may not publish a gated tool as ungated,
  nor invent one. Derived by brace-matching rather than by the generator's own regex,
  because checking a generator against itself passes whatever it believes.
- The hooks inventory is pinned (24 of 24) — the moment an inventory is complete is the
  only moment you can pin it. The components table beside it stays deliberately
  unpinned; it is a map, not an index.
- The convention count is now pinned across all THREE documents that quote it.

## Documents that come back for a second pass

Some documents cannot be finished by track 2 alone, because a later track changes
what they should say. Rewriting them now is still worth it — a document full of dead
paths and wrong locations is not a better starting point for being canonised — but
they are **provisional**, and this is the list so nobody assumes otherwise.

| Document | Waits on | Why |
|---|---|---|
| `tests/README.md` | **Track 3** (test strategy) | It describes how the suite is organised and run. Track 3 canonises the strategy itself — tiers, mock policy, what a test must constrain — and the README has to follow that rather than lead it. Owner flagged this 2026-08-30 |
| `docs/testing/test-file-splitting-playbook.md` | **Track 3** | Same reason, narrower: splitting rules are a consequence of the strategy |
| ~~`src/core/ui/hooks/CLAUDE.md`~~ | ~~Phase B~~ | **Settled 2026-08-30** — rewritten, inventory pinned. The gotchas stay; the generic React around them went |
| ~~`src/core/ui/components/CLAUDE.md`~~ | ~~[[PL-28]] row 2~~ | **Settled 2026-08-30** — the base threshold was already law, so its restatement here was DELETED and the file points at the handbook. Only the override stays, as judgement |

**Both second-pass rows that belonged to this track are now closed.** What remains in
this table is Track 3's, and only Track 3 can close it.

The rule this implies: **a track-2 rewrite fixes what is FALSE, and does not try to
settle what a later track owns.** The tests README lost nine dead or wrong claims and
kept its strategy-shaped content untouched, which is the right split.

## Phase C — every document enforced

**What "enforced" means for a document**, because it is not obvious: every CHECKABLE
claim in it has a pin that fails the build when the claim stops being true. A claim is
checkable when it names a count, a list, a symbol, a path, or a file. Prose reasoning —
*why* the breakpoint is derived, *why* signed-out is never a Retry — cannot be
enforced, and that is fine. It also must not be phrased as a checkable claim when it
is not one.

What already exists, all verified by planting the defect rather than by grepping for
a keyword:

| Check | Covers |
|---|---|
| `doc-module-refs.test.ts` | every cited path resolves, in every `*.md`, including relative ones |
| `claude-md-handbook-agreement.test.ts` | the shared rules, the convention scorecard, the glossary's area names, the 8 bundle names, the stacks and demo-package counts, the four gate seams |
| `tooling-registry.test.ts` | every skill is registered AND routed in CLAUDE.md; the gate script's step count matches its documented table |
| `architecture-rules.test.ts` | the ledgered architecture rules, including `layerDirection` |

**The gap to close in this phase**, re-measured 2026-08-30 rather than carried
forward — the earlier version of this paragraph named "the 24 hooks, the 33
components", and neither file states a count any more. The list had gone stale
inside the item whose whole subject is stale counts, which is worth recording.

What the four files actually claim today, and none of it is pinned:

| File | Unpinned counted claim |
|---|---|
| `src/features/sidebar/CLAUDE.md` | `6 tiles` / `7 tiles`, the derived `640px` breakpoint, `four pixels` |
| `src/features/projects-dashboard/CLAUDE.md` | `21 keys`, `5 items` |
| `src/core/ui/hooks/CLAUDE.md` | none — its counts are prose ("two steps") |
| `src/core/ui/components/CLAUDE.md` | none — same |

**DONE 2026-08-30.** Six pins in `doc-module-refs.test.ts`, each verified by planting.

| Pinned | Against |
|---|---|
| sidebar's tile counts (2 + 4 = six) | the labels `AiZone` and `UtilityBar` actually render |
| the arithmetic table's `<- TODAY` row | the current tile count — so adding a tile without moving the marker fails |
| the 640px breakpoint it explains | `@media (max-height: …)` in `custom-spectrum.css` |
| projects-dashboard's 21 handler keys | the `defineHandlers` map |
| `SearchHeader`'s default of 5 | `props.searchThreshold ?? 5` |

NOT pinned, deliberately: the sidebar's "four pixels, too thin" is a NARRATIVE about a
miscalculation the file goes on to correct, not a claim about today's code. Pinning it
would freeze a story.

**Two of the four plants passed the first time, and neither was a fluke.** The tile
counter matched `>(Tools|Help|Settings|Logs)<` — an allowlist of the four tiles that
exist — so a fifth tile left the count at four and the check could not fail. It counts
`aria-label` now, which every tile carries. And the handler-key plant never landed at
all (`grep -c` said 0), which reads exactly like a passing check. Both were caught by
checking that the plant took effect before believing the result — the same trap this
programme hit twice earlier the same day.

Do not pin a number that churns. `AI_CONTEXT_VERSION` was removed from CLAUDE.md
rather than pinned, because it bumps on every bundle change and a pin would buy churn
instead of safety. The test is whether a reader needs the number, not whether it can
be checked.

## Why an epic

It has children in all but name and outlives any one sitting. It closes when every
document has been through all three phases — not when the rewrites are done, which is
the point of Phase C existing.

## Shipped so far

- 2026-08-30  docs(adr): read all 23 records; fix what the index asserted but never checked (`b77362435`)
- 2026-08-30  docs(build): the build guide described webpack; this repo has none (`b3ebeb10f`)
- 2026-08-30  docs: state the nine kinds of document, and retire evaluation-mode from develop (`7ede5be6c`)
- 2026-08-30  docs(handbook): catalogue Pattern B -- an enforced convention defined nowhere (`8bb2041fe`)
- 2026-08-30  docs: Phase B finds three defects in my OWN rewrites, and enforces two lists (`1ee791e2b`)
- 2026-08-30  docs(rptc): one home for the artifact-location table (`cacc8ea8e`)
- 2026-08-30  docs(rptc): point the pre-push line at `npm run gate` (`339978d68`)
- 2026-08-30  docs(architecture): list where-code-goes.md, and enforce index completeness (`af95f5af8`)
- 2026-08-30  docs(src): rewrite src/CLAUDE.md, 244 -> 77 lines (`50caa56bb`)
- 2026-08-30  docs(backlog): correct the record -- Phase A missed four files (`7315c6de5`)
- 2026-08-30  docs(troubleshooting): rewrite both guides; one was giving harmful advice (`7d6f697c5`)
- 2026-08-30  docs(testing): rewrite the splitting playbook, 462 -> 84 lines (`83c93c0f2`)
- 2026-08-30  fix(tests): repair the two reference failures my own rewrite introduced (`5f7972519`)
- 2026-08-30  docs(tests): rewrite tests/README.md, 461 -> 154 lines (`188fe9061`)
- 2026-08-30  docs(backlog): open PL-29 -- track 2, with enforcement as its closing phase (`46705d171`)
- 2026-08-30  fix(skills): the shipped mesh command does not exist; bump AI_CONTEXT_VERSION (`d1316e832`)
- 2026-08-30  docs: read every module README + product template; pin the skill counts (`53d6505fd`)
- 2026-08-30  docs(skills): read all 37; fix a skill that defended a deleted mechanism (`1532f4805`)
- 2026-08-30  docs: finish Phase B — the catalog was telling agents a delete was safe (`5ad2eb24b`)
- 2026-08-30  docs(backlog): re-measure the Phase C gap; its own list had gone stale (`40c025706`)
- 2026-08-30  docs: finish Phase C — pin the five numbers, and two pins that could not fail (`bef763f88`)
- 2026-08-30  docs(handbook): pair the three verification rules that lived only in CLAUDE.md (`b95db0807`)
- 2026-08-30  docs: standardize the front door — one per area, and the frontend had none (`e5fe59592`)
- 2026-08-30  docs(backlog): the second-pass table still listed Phase B as pending (`87b7456a6`)
- 2026-08-31  docs(handbook): pair ADR-016's three unstated builder rules (`0420e2fe9`)
