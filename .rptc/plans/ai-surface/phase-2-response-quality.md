# Phase 2 — Response quality — **COMPLETE 2026-08-16**

**Part of `.rptc/plans/ai-surface/` — read `overview.md` first.**

Rewritten after the work. What it replaced was a set of predictions derived from reading source;
about half held. **The half that did not is the more useful record**, so it is kept below rather
than deleted.

## What shipped

| Tool | Before | After | How |
|---|---|---|---|
| `list_adobe_projects` | 111,748 | 1,987 | paging + search; `deletable` replaces `who_created` |
| `get_datapack_activity` | 25,056 | 5,709 | agent-sized page default |
| `verify_ai_setup` | 19,091 | 309 | inventory → counts; `inventory:"full"` restores it |
| `list_installed_datapacks` | 16,611 | 4,055 | drop `art`, `dataTypes` → count |
| `find_datapacks` | 10,456 | 4,207 | same |
| `get_project` | 9,532 | 5,179 | `aiFileHashes` collapsed |
| `list_console_apis` | 8,693 | 7,284 (1,530 searched) | group legend once + `search` |
| `list_ai_prompts` | 4,848 | 511 | index + `promptId` detail |

Plus three unbounded lists capped that no measurement had flagged, because they are only large on
data bigger than a developer's machine: `list_projects` (18,191 at 300 projects),
`get_block_authoring_shape` (21,992 at 300 components), `list_content` (67,304 at 900 entries).

Enforcement landed with it — `tests/features/ai/server/responseCeilings.ts` records a ceiling and
a REASON for 33 tools, asserted by the suite that drives each, with two-way coverage assertions so
a new tool without a ceiling fails and a ceiling for a deleted tool fails.

## The predictions, scored

| Prediction | Outcome |
|---|---|
| `get_project`'s `aiFileHashes` is ~46% of the payload | **Right** — 45% measured live |
| `verify_ai_setup` is 15–25KB of low-value inventory | **Right** — 19,091, of which the verdict was 170 |
| `list_console_apis` carries picker-only fields | **Right**, though flattening them saved 16%, not a large cut |
| Bloat is concentrated, not systemic | **Right** — four tools were 78% of the read surface |
| Six tools return the literal `{}` | **No longer true.** Zero do — fixed on develop, or belonging to tools since gated |
| A live harness is unnecessary; static derivation traced all 52 | **Wrong, and the costly one** |

## The lesson: static derivation kept producing confident wrong answers

The retired plan concluded a live harness was unnecessary because static reading had "traced all
52 with measured sizes". Every large finding here came from calling the running server, and
several were invisible to any amount of reading:

- **`list_adobe_projects`, 111,748 bytes** — bigger than the four tools the plan did identify,
  combined. Static never flagged it. An earlier live sweep read it at 4,767 because Adobe auth was
  not active; only a signed-in call against a 725-project org showed it.
- **The Data Installer's 25KB** — that file's own comment said these tools needed no shaping,
  reasoning correctly over a 40-row FIXTURE. Live had 1,099 rows.
- **The three unbounded lists** — surfaced only by driving tools with deliberately oversized
  payloads.

Static reading also misclassified tools three times in one session answering a single question
("which tools are gated?"), and the third attempt ran `republish` against a live storefront. The
`mcp-live-probe` skill carries the details.

**The rule this earns:** a fixture tells you a payload's SHAPE, never its VOLUME. Measure against
live data, or against a payload deliberately larger than production.

## The harness risk was real; the answer was to bound it, not skip it

The retired plan was right that an enumerate-and-call harness is dangerous — 8 tools take no
required arguments. Skipping measurement was the wrong conclusion. What made it safe:

- an **allowlist** of read-only names in the probe, refusing everything else (a denylist was tried
  first and let `sync_content` and `republish` straight through);
- **`--force` that names its one tool**, never a blanket override;
- a **stub-handler harness** for state-changing tools: the confirm gate protects the handler, the
  handler is a stub, so a destructive tool's SUCCESS response is measurable with no side effect.

## The two shapes behind every finding

1. **A list with no page size** — the size is the data's, not the tool's, and an agent's first
   call is always `{}`, so the default IS the cost.
2. **A field carried for the dashboard** — `art` thumbnails, repeated `dataTypes`, `who_created`.
   The last was 46% of one response and unusable by its recipient: the comparison it feeds needs a
   token claim only the extension can read.

Both are invisible in a fixture and obvious in production.

## Two shipped-code defects found on the way — both FIXED on develop

1. 19 tools changed state with no confirmation; the gating was corrected (`8cf9674d`).
2. `check_mesh` could never succeed — no `inputSchema`, handler required `workspaceId` (`18e16d48`).

## Not done, deliberately

Bespoke state-changing tools with no driving test — `create_project`, `delete_project`,
`reset_eds_project`, `apply_updates` and similar — carry no recorded ceiling. They return a
verdict about one operation rather than a list, the one shape this audit never found bloat in.
Building service mocks to prove a one-line response is small is the wrong trade. Recorded so the
gap is a decision, not an oversight.

**Phase 3 is substantially delivered here** (the ceiling table and its coverage assertions). What
remains of it: pin the tool catalog itself, and test the response-envelope convention.

## Corrections to the constraints this plan used to carry

- **"Tool-surface size is NOT a cost — 52 descriptions ≈ 1,175 tokens."** Withdrawn twice over:
  the live catalog for 65 tools is 9,656 bytes, and demo-builder is one of three servers an agent
  loads. See `overview.md`, which holds the current version of this constraint.
- The 3-class read/mutate/destroy split in `tool-inventory.md` is still unreconciled with the
  PM-approved 4-tier policy (`docs/research/2026-05-30-ai-first-experience.md` §1a). Unchanged by
  this phase; reconcile before relying on either.
