# Finding gaps in our own agent surface — research

**Item:** `AI-1c` · **Date:** 2026-08-26 · **Status:** research done, both open
questions answered from evidence.

## What was asked

The item left two decisions open:

1. Is this a command, a skill, or a report at release cuts?
2. Does it read transcripts, the live recorder, battery results, or all three?

## Answer to (2), which settles (1)

**Transcripts alone, to start.** They produced a complete, actionable finding in
about three minutes with no infrastructure and nothing running.

Measured corpus: **358 `.jsonl` files** under `~/.claude/projects/`, of which
**50 are inside demo projects** — the only ones that answer "what does an agent
do when it is using the product?". Everything else is this repo developing
itself, and mixing the two is how the earlier hand pass over-counted.

Inside those 50: **171 Bash calls, 106 MCP calls, 127 other tool calls.**

The recorder and the `measurement/` battery both need the extension running and
a session driven on purpose. Transcripts are already on disk, already complete,
and already historical. Start there; add the others only if a question comes up
that transcripts cannot answer.

That answers (1) too: a source that is a static corpus, analysed periodically,
producing proposals rather than changes, is exactly the shape of `dream`,
`codebase-sweep`, `rptc-hygiene-scan` and `ai-coverage-scan` — **a skill with a
script, run at release cuts.** Not a command (nothing to do on demand), and not
a panel section (the item is explicit that "for us" findings must not be buried
in a surface a producer reads).

## The mechanism works — shape 2 is detectable

The item names three shapes; shape 2, "a job agents do WITHOUT us", was the
unproven one. It is detectable, and it is the strongest signal on the page.

Grouping every Bash call in demo-project sessions by the binary it invokes:

| calls | command | reading |
|---|---|---|
| 25 | `cat` | ordinary file reading, not a gap |
| 18 | `echo` | scaffolding inside compound commands |
| **13** | **`curl`** | **a job the extension should do** |
| **13** | **`aio`** | **a job the extension should do** |
| 11 | `grep` | ordinary |

Counting every occurrence rather than the leading verb: **35 `curl`** and
**32 `aio`** invocations.

## Two evidenced tool gaps

Both verified against the shipped surface (128 distinct tool names) before being
called gaps — neither exists:

### 1. Running a Commerce/Catalog GraphQL query

The `curl` calls are overwhelmingly hand-built GraphQL POSTs against the
project's own backends — Commerce Core, Catalog Service, Live Search, and the
mesh — each one re-specifying `Content-Type` and the `Magento-*` store-scope
headers by hand.

`get_commerce_endpoints` (shipped 2026-08-26) closed the *discovery* half: an
agent can now ask where the endpoints are. Nothing runs a query against them, so
the agent still assembles the request itself every time.

Files mentioning GraphQL in the server directory
(`commerceEndpointsTool`, `configureProjectTool`, `createProjectTool`,
`componentRequirementsTool`, `statusDescriptors`) all handle endpoints and
config. **None executes a query.**

### 2. Reading Adobe I/O context and the deployed mesh

The `aio` calls cluster into two jobs the extension already knows how to do:

- **Orientation** — `aio console where`, `org list`, `project list`,
  `workspace select`. The extension owns this (`ensureOrgContext`), and exposes
  `list_orgs` / `list_workspaces` — but nothing answers "where am I right now?"
- **Reading the deployed mesh** — `aio api-mesh:get`, `:describe`, `:status`.
  Grepping for a mesh-named tool returns **nothing**.

## What this says about the parent question

`AI-1b` found that 20 of 105 tools are ever called and 77% of calls are six
orientation reads. This pass adds the other side: where agents go when the
surface has no answer. Both `curl` and `aio` clusters are **orientation and
querying** — the same shape as the tools that DO get used, which suggests the
surface is not too small in general, it is missing the specific reads an agent
needs mid-task.

## Caveats, unchanged from the hand pass

- **One producer's transcripts** — the repo owner's, who uses the extension
  differently from someone handed it.
- **UI clicks leave no transcript.** Anything done by clicking is invisible here.
- 50 demo-project sessions is a small corpus, and the counts are small enough
  that a single long session moves them.

## Recommendation

Build the skill against transcripts only, emitting the three shapes. It is the
cheapest thing that reproduces what two hand passes have now both produced, and
the second hand pass (this one) took minutes because the query is simple.
