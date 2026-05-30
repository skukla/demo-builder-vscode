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

## 1a. Determinism policy (PM-approved) — the governing rule for ALL AI interactions

Determinism here means **the same request reliably produces the same _correct
outcome_, proven by inspection** — not that the conversation is identical each
time. Variation in phrasing/clarifying questions is fine; variation in the
_result_ is not. Rather than decide this per-flow (which drifts into
inconsistency), every AI-reachable tool/flow is classified into a tier by
**risk × verifiability**, and its treatment follows from the tier:

| Tier | Examples (current tools) | Reversible? | Treatment |
|---|---|---|---|
| **1 — Reads** | `list_*`, `get_*`, `verify_ai_setup`, `check_mesh`, `get_auth_status` | n/a | Trust the model fully — free choice/sequence, no gate. Determinism = the tool returns the same data. |
| **2 — Light/reversible writes** | `start_demo`, `stop_demo`, prompt CRUD, `regenerate_ai_files`, `sign_in`/`select_*` | Yes | Model drives; per-tool validation; confirm only where there's a side effect. |
| **3 — Heavy / multi-step** | `create_project`, `reset_eds_project`, deploy mesh, `apply_updates`, `republish`, `sync_content` | Costly | **Scripted skill + confirm-the-plan + full external verify gate.** Where we spend determinism. |
| **4 — Destructive / irreversible** | `delete_project`, `delete_github_repo`, `cleanup_dalive_site`, `delete_mesh` | No | Tier-3 rigor **plus** extra-strict gating (e.g. `confirmName` echo) + explicit human "are you sure". |

Most existing tools already match their tier (confirm-gates, `needsAuth`
handoffs, `confirmName` on `delete_project`). This policy **names the rule the
migration already half-followed**, makes it explicit, and surfaces the gaps to
fill — chiefly a **reusable external-verify capability** that Tier-3/4 flows call.

**Cross-cutting work this implies (feeds the plan):**
1. A shared **verify capability** Tier-3/4 flows invoke (today only
   `verify_ai_setup` approximates it).
2. The **confirm-the-plan** convention standardized across Tier-3/4.
3. An **audit** placing every existing tool in its correct tier.

**Subagent isolation** is an _optional_ Tier-4 belt-and-suspenders, deferred to
backlog and added only where blast radius proves to justify it — not a per-flow
decision.

---

## 1b. Settled design decisions (PM-approved)

These resolve the §5 open questions; planning inherits them as fixed inputs.

- **Constraint model for `create`:** **Scripted** (max determinism) — a skill
  playbook the model can't deviate from: gather → echo a concrete plan for one
  confirmation → call tools in fixed order → verify → anchor. (Tier-3 treatment
  by the policy above; ongoing _management_ flows stay Tier-2/looser.)
- **Verification scope:** **Full external verify** — inspect every real artifact
  (manifest + `.env` valid, GitHub repo exists, mesh deployed & responding,
  DA.live/Helix content published, AI files generated). "Done" = this passes.
- **Cold-start launch context:** Global socket, **cwd = the extension's projects
  directory** (`~/.demo-builder/projects`). Rationale: Claude Code discovers
  `.mcp.json`/`AGENTS.md`/skills from cwd, so we seed a small "create context"
  there (create-eds-project skill + `.mcp.json` → global socket); the launch
  lands somewhere that already knows about Demo Builder, then `open_project`
  anchors the real project after create. (Beats a bare home dir or throwaway
  scratch workspace.)
- **Multi-window tiebreak:** **Prompt the user to pick** which Demo Builder
  window answers when more than one is live. (Unambiguous over convenient.)
- **Determinism spend on the create flow:** skill playbook + tool validation +
  **full external verify gate** + **one post-create hook** (guaranteed
  workspace-anchor, model-independent). **Scoped creation subagent deferred** to
  backlog (add only if Tier-4 blast radius proves it necessary).
- **Auth-in-the-loop UX:** _still open_ — see §5.

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

## 5. Decisions

**Resolved (PM-approved — see §1a/§1b):** constraint model (scripted create),
verification scope (full external verify), cold-start launch context
(projects-dir cwd + global socket), multi-window (prompt to pick),
determinism spend (verify gate + one post-create hook; subagent deferred), and
the governing tiered determinism policy.

**Still open (carry into Plan):**

1. **Auth-in-the-loop UX.** How browser sign-ins (`needsAuth` → `sign_in`)
   surface mid-conversation so they feel first-class, not like errors — and how
   the scripted skill pauses/resumes around them.

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
