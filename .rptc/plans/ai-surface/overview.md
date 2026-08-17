# Optimize the extension's AI surface

**The program.** Make the AI surface good enough that an agent can do real work through the
extension — then use it for creative work like building demos. Individual phases have their own
files; this sequences them and holds what is known about each.

**Created** 2026-08-16, consolidating two plans that had collided on one slug (see "History").

## The surface, and what is measured about each axis

| Axis | Question | Measured state |
|---|---|---|
| **Coverage** | Can an agent reach the feature? | Phase 4 closed this axis: **103 tools**, every planned group shipped. The old "82 unreachable of 142" figure is retired — it was never re-measured and phase 4 worked from the plan's own group lists instead. Re-run `ai-coverage-scan` before citing any new number, and read its own caveat first: its extractor over-counts by matching nested object keys (it reported 31 unexposed data-installer handlers where reading the maps gave 9) |
| **Quality** | Is what comes back usable? | ✅ **Phase 2 complete.** 8 tools reshaped, 3 unbounded lists capped, 33 ceilings enforced. `list_adobe_projects` alone 111,748 → 1,987 |
| **Guidance** | Does it know when and how? | **14** generated skills, not 21 — counted 2026-08-17. Of 103 tools, 80 are named in no generated guidance at all, which is NOT a backlog: tools are self-describing and "no new skills unless multi-step-with-traps" is a standing constraint. The real finding was that `diagnose-demo` was WRONG twice, not thin. "No open-ended design skill" is unre-checked and rests on the wrong count |
| **Enforcement** | Does it get things wrong anyway? | ✅ **Phase 3 complete.** Three guards: response ceilings, catalog pin, response envelope. 10 of 24 documented conventions remain prose only (was 11); the two that could be enforced and are not are named in the phase file with why |
| **Roles** | Who does the work? | No agent definitions ship — and that is a FINDING, not a hole. The one flow spanning 3+ skills with a required order (the EDS scraping cluster) is already orchestrated by `scrape-reference-site`, in the cheaper form. Re-open only if a flow appears with no natural orchestrator skill AND the ordering is measurably being got wrong |
| **The chain** | What ELSE is in the agent's surface? | Ours is now **103** (was 58 when this row was written), so the chain total is stale by ~45. The external halves — 11 commerce-extensibility + 23 playwright — were measured live 2026-08-16 and are unchanged. One external tool still writes the process-global `aio` selection the extension deliberately stopped writing; the reading side is fixed, the conflict is not |

Evidence: seven parallel research agents, 2026-08-16, all cited in the phase files. Earlier
research at `.rptc/research/ai-surface-coverage/research.md` (2026-08-12).

> **Every number here rotted within hours of being measured.** `feature/data-installer` merged to
> develop (`7c7fcc43`) the same day: handler types went 106 → 142, the agent-relevant gap 53 → 82,
> tools 52 → 58. **Re-run `ai-coverage-scan` before citing any figure in this program.** The
> phase files record what was true at measurement time and say so; they are not live state.

## Phases, in dependency order

Each is cheap because the one before it made it cheaper. **Do not reorder without a reason** —
the notes say what each ordering buys.

| # | Phase | Why here | File |
|---|---|---|---|
| 0 | ✅ **External tool chain** | Changes the DENOMINATOR of every other phase. An agent sees demo-builder tools plus whatever else the extension installs. If an external tool covers a gap, phase 1 builds something redundant; if one conflicts, phase 2 polishes one side of a contradiction. Reading, not building. | `phase-0-external-tool-chain.md` |
| 1 | ✅ **Content-authoring tools** | The only gap that changes what is POSSIBLE rather than what is pleasant. An agent cannot write a page today, so it cannot build a demo. 5 of 6 tools just expose existing service methods. | `phase-1-content-authoring.md` |
| 2 | ✅ **Response quality** | Ran on the premise that six tools returned `{}` and five carried bloat. Zero returned `{}` by the time it ran, and the real problem was concentration: four tools were 78% of the read surface, and the biggest (111,748 bytes) was invisible to the static analysis that planned the phase. | `phase-2-response-quality.md` |
| 3 | ✅ **Enforcement** — closed 2026-08-17 | What stops the surface degrading again: ceiling table, catalog pin, and now the envelope guard. Writing that guard found the duplication `mcpToolResult` was extracted to remove had grown BACK (10 of the 23 registrar modules hand-rolling the envelope) and that the convention itself was misstated — refusals answer in prose, not JSON, including in the shared registrar. `asText` + `asRawText` now cover both, and all 23 go through one of them. The first version of the guard scanned one directory and missed ten tools in `src/mcp-server.ts`; two review agents caught it independently | `phase-3-enforcement.md` |
| 4 | ✅ **Coverage breadth** — Groups 1–8 shipped 2026-08-17, **65 → 103 tools** (measured, and cross-checked against the running server's own count) | Expose the qualifying unexposed handlers. Step 01's list was too short: it disqualified 21 handlers for pushing their result through `sendMessage`, which `capturePayloadFrom` now solves without touching a handler. Groups 6–8 cost more per tool than 1–5 because nothing in them was dispatchable. | `phase-4-step-02-full-parity-plan.md` · handoff: `.rptc/handoff/2026-08-17-ai-surface-phase-4.md` |
| 5 | ✅ **Skills** — shipped 2026-08-17 | Scored against the post-phase-4 tool surface — that is its denominator, so it could not start earlier, and the denominator moved 65 → 103 while it waited. The finding was not "add skills for uncovered tools": `diagnose-demo` was WRONG twice (empty product pages routed to store scope when the cause was a refused site-config write; empty catalogs routed to a category tree that structurally hides them), and `import-datapack` is the one new workflow that earned a file. Finding 3 — an open-ended design skill — was DEFERRED by decision to a future design-skill pass, not left open here ([`../../backlog/2026-08-17-open-ended-design-skill.md`](../../backlog/2026-08-17-open-ended-design-skill.md)) | `phase-5-guidance.md` |
| 6 | 📋 **Hooks, then agents** — planned 2026-08-17 | Scoped to the GENERATED bundle, not this repo's dev hooks. One hook candidate clears the bar (the `aio` global-selection conflict — measured, agent-reachable, detectable from the tool name, and unfixable by guidance since we install the tool that causes it). The agents half ships NOTHING: the one flow spanning 3+ ordered skills is already orchestrated by a skill. Governing lesson: the existing git-sync hook silently did nothing on every EDS project ever generated | `phase-6-hooks-and-agents.md` |

## Standing constraints (from the record, not invented here)

- **Do not expose fire-and-forget handlers.** The disqualifier: *"Does the return value carry the
  OUTCOME, or only the dispatch?"* (2026-08-12 research.)
- **No new generated skills unless multi-step-with-traps** (2026-07-11, shipped work).
- **Do not add agents to save tokens.** Measured: a ~121,000-token derivation was performed BY a
  subagent. Isolation moves where cost is paid; it does not reduce it.
- **Tool-surface size is UNDECIDED — the earlier "not a cost" ruling is reopened.** It rested on
  ~1,175 tokens measured by grepping source; the live probe says **1,837** for demo-builder, and
  demo-builder is 52 of an **86-tool** surface (11 commerce-extensibility + 23 playwright, both
  measured live). Do not cite the 1,175 figure or the "not a cost" conclusion; both were measured
  against 60% of the real surface. Also note `verify_ai_setup` alone returns ~4,695 tokens — one
  call costs more than the entire tool catalogue.
- **Never call a destructive tool to measure it**, and never enumerate-and-call with `{}`:
  19 tools mutate state ungated and 8 take no required arguments.
- **Two org-targeting models coexist in one project.** The extension targets `aio` per-operation
  via `withOrgContext`, having deliberately stopped writing the CLI's process-global selection
  (`orgContextEnv.ts:116-122`). The `commerce-extensibility` MCP it installs ships
  `aio-configure-global` / `aio-app-use` / `aio-where`, which write and read exactly that state.
  The measured failure mode already happened once from a single unwrapped internal call —
  `deployMeshHeadless` deployed into a DELETED project for two days. Do not add tools or guidance
  that assume the global selection is meaningful.
- ~~**Do not assume a credential reaches multiple Commerce instances.**~~ **RESOLVED
  2026-08-16** — `669cfd2a docs(research): one Commerce credential reaches every instance in its
  org`. This program recorded it as unresolvable from outside ("needs the service owner"); it was
  measured instead. See `.rptc/research/data-installer-credential-home/`.
- A PM-approved **4-tier policy** already classifies AI-reachable tools
  (`docs/research/2026-05-30-ai-first-experience.md` §1a). The 3-class split in
  `tool-inventory.md` is unreconciled with it — reconcile before relying on either.

## Two shipped defects found during research — NOT part of this program

Independent of the AI surface work, and they belong to whoever owns that code:

1. **19 tools change state with no confirmation**, against a documented rule requiring it.
   `refresh_block_library` is called "destructive" in §9 of the same doc and is ungated.
   `promote_block_to_library` commits, pushes and publishes ungated while its literal inverse
   IS gated — same blast radius, opposite protection.
2. **`check_mesh` can never succeed.** Its descriptor declares no `inputSchema`; its handler
   requires `workspaceId`. Every MCP invocation dies at validation. Confirmed independently twice.

## History — why two plans existed

`.rptc/backlog/ai-surface-coverage/` (created 2026-08-12, paused 2026-08-13) is the **coverage**
axis. A 2026-08-16 session created a plan under the *same slug* for the **quality** axis without
finding it — the duplication the backlog README explicitly warns about. The two never conflicted
on substance, only on name: one adds tools, the other improves what tools return.

This program supersedes the naming collision. The coverage plan stays where it is, in backlog,
and is adopted as phase 4 rather than rewritten.

## Where the redesign fits

The Bodea storefront redesign was the original driver and is now a **validation activity**, not a
phase. Attempting it exercises phases 1, 5 and the theme question in one go. It is unblocked
whenever wanted; it will hit the phase-1 gap immediately, which is itself a useful measurement.
