---
id: AI-1b
kind: question
area: ai
parent: AI-1
needs: AI-1c
value: high
status: open
---
# 104 tools, and agents reach 20 of them

> **RE-MEASURED 2026-08-25 (same day, later session). The headline changed; the
> finding survived and got sharper.** The original title was "agents are barely
> asked to use them" and the body said "almost none of them exercise the
> extension". Re-deriving the numbers from the raw transcripts showed that is too
> strong — **38 of 48 sessions DID call Demo Builder tools**. What is true, and
> worse, is narrower: **20 of 104 tools are ever called, and 77% of all calls are
> four orientation questions.** The corrected measurement is in
> "What the re-measurement found" below; the original text is kept beneath it
> because its reasoning and its caveats still stand.

## Provenance

Surfaced 2026-08-25 while collecting prompts for the Evaluation Mode battery
(`.rptc/plans/evaluation-mode/measurement/`). The survey was meant to produce
five held-out prompts. It produced this instead, which is worth more.

## What the re-measurement found (2026-08-25, 48 sessions)

Derived from the raw `~/.claude/projects/-Users-kukla--demo-builder-projects*`
transcripts by counting `tool_use` blocks, rather than by reading the asks. That
matters: the first pass judged usage from what the producer TYPED, and a session
whose ask never mentions the extension can still route through six of its tools.

| Measure | Value |
|---|---|
| Sessions in demo projects | 48 |
| Sessions that called at least one Demo Builder tool | **38** |
| Demo Builder tool calls | 95 |
| All other tool calls (Bash, ToolSearch, Read, …) | 304 |
| Distinct Demo Builder tools ever called | **20 of 104** |
| Tools never announced AND never used | **76 of 104** |

**The concentration is the finding.** Six tools account for 73 of the 95 calls —
**77%** — and every one is an orientation read:

    get_current_project  22    list_projects        8
    get_project_urls     16    get_project_status   5
    get_project          13    get_auth_status      9

Everything that DOES something totals about 13 calls: `republish` 3,
`update_project_config` 3, `check_mesh` 2, `sign_in` 2, and one each of
`deploy_mesh`, `start_demo`, `deploy_integration`, `open_url`.

### Announcing a tool is what gets it used

The generated bundle was checked and is CURRENT (`aiContextVersion: 22` against a
shipped `AI_CONTEXT_VERSION` of 22), so this is not staleness. It is coverage:

| | Count |
|---|---|
| Tools named anywhere in the bundle (AGENTS.md + all 22 skills) | **15 of 104** |
| …of those, actually used | 7 |
| Used despite never being announced (found via `ToolSearch`) | 13 |
| Announced but never used | 8 |

`ToolSearch` was the agent's **second most-used tool at 70 calls**, which is what
finding the other 13 costs. So discoverability is real but partial — announcing
helps, and search picks up some of the rest.

### The one session of real Commerce work

`de59e150` is 45 of the 102 distinct asks and all the substantive consulting. It
made **14 Demo Builder calls against 157 other tool calls**. Of its 94 Bash
commands: **28 were HTTP/GraphQL straight at Commerce**, 18 `aio` CLI, 14 file
reads, 6 packaging, 5 npm, 4 git/gh.

That splits cleanly, and the split is the actionable part:

- **Out of scope, and should stay out** — running catalog queries, building
  Postman collections, writing a partner integration guide, debugging a B2B
  login. That is consulting work. Growing tools for it would be a roadmap change
  chasing one session.
- **In scope, and missing** — the *connection facts* that work needed. Nothing
  answered "what is this project's GraphQL endpoint". `get_project_urls` returns
  places a BROWSER opens; `get_project_status` returns the mesh endpoint only;
  `accsGraphqlEndpoint` exists on the surface exclusively as an INPUT
  `discover_store_structure` expects the caller to already know. It was reachable
  only by asking `get_component_config` to read a `.env` by relative path.

## What has been done about it

| Date | Change |
|---|---|
| 2026-08-25 | **`get_commerce_endpoints` shipped** (`commerceEndpointsTool.ts`) — the backend GraphQL endpoint, Catalog Service, the deployed mesh, which one the storefront queries, and the `Magento-*` request headers with the store scope they select. Headers come from `generateHeaders`, the same function that writes the storefront's `config.json`, so an agent and the site it is debugging cannot query two different stores. Returns nothing the registry marks `secret: true`, asserted by a test |
| 2026-08-25 | **The bundle now announces it** — a `Querying Commerce` section in the generated `AGENTS.md`, `AI_CONTEXT_VERSION` 22 → 23. Added *because* of the measurement above: a tool nobody is told about is a tool nobody calls. It names the tool rather than baking values in, since the endpoint, mesh and scope all change between regenerations and a confidently stale endpoint is worse than none |

**Still open:** the other 76 tools that are neither announced nor used. That is a
triage — delete, consolidate, or announce — and it is the largest remaining piece
of this item.

## What was measured

Every Claude Code session run **inside a demo project** — the place a producer
would actually reach for these tools. 37 sessions, 70 distinct asks after
removing tool results, pastes and one-word replies.

**Almost none of them exercise the extension.** The overwhelming majority are
Adobe Commerce consulting:

- GraphQL query shapes, and what the catalog returns
- Postman collections for a partner integration
- Which category holds which products, and why one looks empty
- What endpoints a partner needs, with and without a mesh

The ones that touch Demo Builder at all are orientation and sign-in:

    We're in a new home now. Please use the demo builder mcp to find out which project.
    run the Demo Builder sign_in tool with provider dalive.
    To be clear, that's the DEMO BUILDER project. Run the skill to rehome yourself.
    I've now created the full project. Should be headless-paas.

Note what those four have in common: they are the producer telling the agent
where it is. Not one asks it to DO anything the extension can do.

## Why this matters more than the battery it came from

The Evaluation Mode work makes agent paths cheaper and more visible. That is
worth doing and it is nearly finished. But it optimises a surface that this
survey says is barely being asked for — and no amount of prompt efficiency helps
a tool nobody invokes.

## Two readings, and they need opposite fixes

1. **Producers do not know the tools exist.** A discoverability problem. The
   fix is in the generated AGENTS.md, the skills, onboarding — telling agents
   and people what is available. Efficiency work does nothing for it.
2. **The tools are not what producers need.** A surface problem. The real work
   is Commerce data: catalog shapes, query building, partner integration
   artefacts. The fix is different tools, and the efficiency work is aimed at
   the wrong target.

They are not exclusive and the split matters, because reading 1 is a week of
documentation and reading 2 is a roadmap change.

**The 2026-08-25 re-measurement points at BOTH, in a specific mix.** Reading 1 is
real but bounded — the bundle names 15 of 104, and announcing correlates with use
(7 of 15 announced tools were called, against 13 of the other 89). Reading 2 is
real but far smaller than feared: the Commerce work needed *one* missing read, not
a different surface. What the numbers actually argue for is a THIRD thing neither
reading named — the surface is too big for its demand. 76 tools are neither
announced nor used, and that is a triage rather than either fix above.

## What would tell them apart

Cheap, and worth doing before either fix:

- **Ask three producers** what they last asked an agent to do in a demo project,
  and whether they knew the extension could do it. If they knew and did not use
  it, that is reading 2.
- ~~**Check `verify_ai_setup` inventory across real projects**~~ **DONE
  2026-08-25.** The bundle is present and CURRENT on the real projects
  (`aiContextVersion: 22` = the shipped version). Staleness is not the
  explanation. What the check did surface is that the bundle NAMES only 15 of
  104 tools — so the discoverability problem is coverage, not freshness.
- Once the `measurement/` battery exists, per-group coverage becomes a standing
  number rather than a one-off survey.

## Caveats, stated because they weaken the finding

- **One producer's sessions.** These are the repo owner's own transcripts. A
  developer building the extension uses it differently from a producer given it.
  This is a strong signal about ONE user and a weak one about the population.
- **Only sessions run inside demo projects** were surveyed. Work done from the
  extension's UI leaves no transcript, so anything a producer did by clicking is
  invisible here.
- The MCP tool surface grew through 2026; some of these sessions predate tools
  they could have used.

None of these dissolve it. A surface of 104 tools showing up four times in 70
asks is not explained by sampling.

## Kickoff prompt

```
/rptc:research "Are Demo Builder's 104 MCP tools discoverable, or are they the wrong
tools? Read .rptc/backlog/2026-08-25-agents-barely-use-the-tool-surface.md first — it has
the survey, the two competing readings, and the cheap checks that tell them apart. Start
with the AI-bundle freshness check across real projects; it is the one that can be done
without asking anyone."
```
