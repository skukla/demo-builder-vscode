# AI-First Experience — Research & Plan

**Status:** Research + Plan (RPTC phase 1–2). Not yet in TDD.
**Owner:** TBD
**Relates to:** PR #2 (in-extension MCP server), `.rptc/backlog/2026-05-30-global-mcp-entry-point.md`
**Goal:** A first-class, start-to-finish AI-first experience driven from the
extension — a user can go from "nothing" to "a working, correct demo project,"
and then manage it, by conversing with the agent (Claude Code) — with results
that are **deterministic**, not "whatever the model felt like this time."

---

## 1. Guiding principle: the LLM orchestrates, deterministic mechanisms execute & verify

The hard requirement is *deterministic results* from a non-deterministic driver.
We get there by giving the model as little load-bearing work as possible and
pushing the actual work into mechanisms that behave the same way every time. Four
tools at our disposal, in increasing order of determinism:

| Mechanism | Determinism | Role in this initiative |
|---|---|---|
| **MCP tools** | High — same input → same effect, validated, idempotent | Do the actual work (create_project, deploy, sync…). The model only *chooses arguments*; it never hand-rolls the operation. Already built. |
| **Skills** | Medium — constrain the *procedure* | Turn an open-ended request ("make me a demo") into a fixed playbook: gather → confirm a plan → call tools in order → verify. Reduces approach variance. `create-eds-project` skill exists; needs hardening into a strict script. |
| **Subagents** | Medium-High — scoped tools, isolated context | Decompose a complex flow and *bound* what the agent can do at each step (a creation subagent can't wander into unrelated tools); also ideal for a **verification agent**. |
| **Hooks** | Highest — run code regardless of the model | Enforce invariants that must happen no matter what the model does: input validation, post-create workspace anchoring, state sync, "did this actually succeed" gates. Not LLM-mediated at all. We already use a PostToolUse git-sync hook. |

**Design rule for every phase below:** if a step *must* happen for a correct
result, it belongs in a tool or a hook — never in "the model will remember to."
The model's job is selection and conversation; correctness is enforced by code.

A corollary worth stating: **"done" must mean "verified done."** Every flow ends
with a deterministic verification (a tool/subagent/hook that inspects the real
artifacts) whose result — not the model's say-so — decides success and drives
self-correction.

---

## 2. Where we are (the migration already built the engine)

The in-extension MCP work (PR #2) delivered most of the *middle* of the journey.
Mapping the journey to current state:

| Stage | Needs | Status |
|---|---|---|
| 1. Entry (cold-start) | "Create with AI" front door + a server reachable before any project exists | **Gap** — dashboard create → wizard only; server is workspace-gated (`if (!workspacePath) return`) |
| 2. Conversational create | `create_project`, a guiding skill + primed prompt, discovery tools, auth handoffs | **Mostly built** — tool ✓, `create-eds-project` skill ✓, seeded prompt ✓, `list_stacks/demo_packages/components` ✓, `needsAuth`/`sign_in` ✓ |
| 3. Hand-off to project | Anchor new project as workspace; switch to its precise server | **Built** — `openProjectAsWorkspace` / `open_project` ✓ |
| 4. Ongoing management | deploy/sync/republish/reset/update/delete conversationally | **Built** — all Phase 4 tools ✓; AI surface ✓ |
| 5. Cohesion & discoverability | UI reflects agent actions; new users get pointed at the AI path | **Gaps** — status reflection + first-run nudge are thin |

**Implication:** remaining work is concentrated at **Stage 1 (on-ramp + cold-start
enabler)** and **Stage 5 (polish)**, plus **hardening Stage 2 for determinism.**

---

## 3. Existing assets to build on

- **Launch:** `src/commands/openInClaude.ts` — terminal launch of Claude Code,
  `Engine` abstraction (`'claude-code'`, extensible), `PENDING_CLAUDE_LAUNCH_KEY`
  workspace-anchor-then-launch handshake consumed on activation.
- **AI surface:** `src/features/dashboard/ui/aiSurface/AiOverviewScreen.tsx`,
  `dashboard/commands/openAi.ts`, `aiHandlers.ts` (verify-ai-setup, inspect-mcp,
  prompts CRUD, regenerate-ai-files).
- **Creation:** `create_project` MCP tool, `create-eds-project` skill, seeded
  pinned prompt (`defaultPromptsSeeder.ts`), discovery tools.
- **Determinism primitives already in place:** confirm-gating, `needsAuth`
  handoffs, captured progress timelines, PostToolUse git-sync hook
  (`mcpConfigWriter` → `.claude/settings.json`), `verify_ai_setup`.
- **MCP server:** `inExtensionMcpServer.ts` + `mcpSocketPath.ts` + `mcp-proxy.ts`.

---

## 4. Plan — phases

### Phase A — Always-on reachability (technical enabler)
Make a server reachable cold-start, deterministically.
- Run the in-extension server on activation on a **stable global socket** (in
  addition to the per-workspace socket), so cold-start tools (`create_project`,
  `list_projects`) are always reachable.
- `mcp-proxy.js` discovery: when `DEMO_BUILDER_MCP_SOCKET` is unset, connect to
  the global socket; if nothing is listening, **fail with a clear message**
  ("open Demo Builder in VS Code") rather than silently.
- Re-home develop's "Register Global MCP" to write the proxy entry.
- **Determinism focus:** global-socket tools run with a context where
  "current project" is explicitly absent; current-project tools return a clear
  `needsProject` signal (not undefined behavior). Decide multi-window tiebreak.
- *Risk:* server lifecycle is sensitive — its own TDD'd change.

### Phase B — AI-first entry point
A real front door from the extension.
- "Create with AI" affordance on the projects dashboard / empty state, beside the
  wizard's "New."
- Launches Claude Code in a **no-project context** (extends `openInClaude` /
  `PENDING_CLAUDE_LAUNCH` to a cold-start case) with the `create-eds-project`
  prompt **primed deterministically** (not relying on the user to phrase it).
- *Determinism focus:* the launch primes a specific skill + prompt so every
  "Create with AI" starts from the same known state.

### Phase C — Creation-flow quality (where "first-class" is won)
Make a conversational create reliably produce a *correct* project. This is the
determinism-critical phase; lean hard on the four mechanisms:
- **Skill as strict playbook:** rewrite `create-eds-project` as a fixed sequence —
  gather requirements → call discovery tools to resolve a concrete plan → **echo
  the plan back for one confirmation** → `create_project` → **verify** → anchor.
  No step is optional or model-discretionary.
- **Tool-enforced validation:** `create_project` rejects incomplete/ambiguous
  input deterministically (so a vague conversation can't yield a half-built
  project). Extend input validation as needed.
- **Deterministic verification gate:** a `verify_project` capability (new tool or
  extend `verify_ai_setup`) that inspects the real artifacts (repo, mesh, config,
  .env, AI files) and returns pass/fail + specifics. The skill must run it and
  self-correct on failure. **"Done" = verify passed.**
- **Consider a creation subagent:** a scoped subagent with only the
  creation/discovery/auth tools, so the flow can't wander; returns a structured
  result the main thread reports.
- **Hooks for guaranteed post-steps:** e.g., a PostToolUse hook that anchors the
  workspace after `create_project` succeeds, independent of the model.
- *Prototype this phase early (spike) — it's the make-or-break, and it informs
  whether A/B's shapes are right.*

### Phase D — Cohesion & discoverability
- Extension UI reflects agent actions (status sync after agent-driven changes).
- First-run guidance pointing new users at the AI path.
- Docs: extend `docs/systems/mcp-server.md` + a user-facing "build a demo with AI"
  guide.

---

## 5. Key decisions to resolve in Plan

1. **Cold-start launch context.** What cwd/workspace does "Create with AI" launch
   into when no project exists? (Global socket + a scratch cwd, vs. a transient
   workspace.)
2. **How constrained is the conversation?** Free-form chat backed by a skill, vs.
   a tightly scripted skill/subagent the model can't deviate from. (Determinism
   vs. flexibility — likely scripted for create, freer for management.)
3. **Verification scope.** What exactly must `verify_project` check to call a
   project "correct"? This defines "done."
4. **Multi-window behavior** for the global socket (most-recently-active? prompt?).
5. **Auth-in-the-loop UX.** How browser sign-ins surface mid-conversation so they
   feel first-class, not like errors.
6. **How far to push subagents/hooks** vs. keeping it skill+tool only (complexity
   budget).

---

## 6. Risks

- **Conversational-create quality (Phase C)** is the dominant risk — the plumbing
  (A/B) is comparatively routine. De-risk with an early spike.
- **Server-lifecycle change (Phase A)** touches a sensitive area; needs careful
  TDD and the graceful-fail path.
- **Determinism vs. UX tension** — over-scripting can make the agent feel rigid;
  under-scripting risks unreliable results. The skill design must balance these.
- **Discoverability is a product/marketing surface**, not just code — out of scope
  for engineering but worth naming so it isn't assumed solved.

---

## 7. Suggested sequencing

1. **Spike Phase C** (skill-as-playbook + `verify_project`) against the *existing*
   per-project path — proves the determinism model before any lifecycle change.
2. **Phase A** (always-on enabler) once C's shape is known.
3. **Phase B** (entry point) wiring A + C together.
4. **Phase D** (polish) last.

Each phase is its own RPTC cycle (Research deltas → Plan → TDD → Commit) and its
own PR. None of this blocks PR #2.
