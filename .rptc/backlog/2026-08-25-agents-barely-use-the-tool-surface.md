# 104 tools, and agents are barely asked to use them

## Provenance

Surfaced 2026-08-25 while collecting prompts for the Evaluation Mode battery
(`.rptc/plans/evaluation-mode/measurement/`). The survey was meant to produce
five held-out prompts. It produced this instead, which is worth more.

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

## What would tell them apart

Cheap, and worth doing before either fix:

- **Ask three producers** what they last asked an agent to do in a demo project,
  and whether they knew the extension could do it. If they knew and did not use
  it, that is reading 2.
- **Check `verify_ai_setup` inventory across real projects** — if the generated
  bundle is stale or absent on the projects people actually work in, the tools
  were never announced to their agents and reading 1 is likely.
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
