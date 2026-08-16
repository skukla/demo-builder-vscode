# Optimize the extension's AI surface

**The program.** Make the AI surface good enough that an agent can do real work through the
extension — then use it for creative work like building demos. Individual phases have their own
files; this sequences them and holds what is known about each.

**Created** 2026-08-16, consolidating two plans that had collided on one slug (see "History").

## The surface, and what is measured about each axis

| Axis | Question | Measured state |
|---|---|---|
| **Coverage** | Can an agent reach the feature? | **82** agent-relevant handler types unreachable (58% of 142) — RE-MEASURE before use. Content authoring shipped in phase 1 |
| **Quality** | Is what comes back usable? | ✅ **Phase 2 complete.** 8 tools reshaped, 3 unbounded lists capped, 33 ceilings enforced. `list_adobe_projects` alone 111,748 → 1,987 |
| **Guidance** | Does it know when and how? | 21 skills, all task- or reference-shaped; no open-ended design skill |
| **Enforcement** | Does it get things wrong anyway? | 11 of 24 documented conventions are prose only; one hook, and it syncs rather than guards |
| **Roles** | Who does the work? | No agent definitions ship at all |
| **The chain** | What ELSE is in the agent's surface? | **92 tools** — 58 ours + 11 commerce-extensibility + 23 playwright (measured live). One external tool writes state the extension deliberately stopped writing; the reading side is now fixed, the conflict is not |

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
| 3 | 🟡 **Enforcement** (ceiling table shipped with phase 2; catalog pin + envelope test remain) | What stops the surface degrading again. The "keep JSON small" rule has been unenforced since day one, which is why phase 2 exists. Pin the catalog; test the envelope convention. | not written — after phase 2 |
| 4 | **Coverage breadth** | Expose the qualifying unexposed handlers. Deliberately AFTER quality and enforcement, so new tools land against a convention that is tested. | `.rptc/backlog/ai-surface-coverage/` (paused; adopt as this phase) |
| 5 | **Skills** | Scored against the post-phase-4 tool surface — that is its denominator, so it cannot start earlier. | not written |
| 6 | **Hooks, then agents** | Hooks enforce traps the earlier phases surfaced. Agents only where a flow spans 3+ skills with a required order. | not written |

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
