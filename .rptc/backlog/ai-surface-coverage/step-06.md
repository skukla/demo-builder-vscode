# Step 06 — Mesh skill, and the prerequisites decision

**Kind:** TDD + generated bundle
**Touches:** same seams as step 05, plus `templates/skills/diagnose-demo.md`

Two small pieces of the same job: close the last guidance gap worth closing, and settle the
one feature that has no surface at all.

---

## 6a — Mesh skill

**The gap:** 3 tools (`check_mesh`, `deploy_mesh`, `delete_mesh`), no dedicated skill. Three
existing skills mention mesh in passing; none explains it.

**Why it earns a skill despite only three tools:** `check_mesh` answers two different
questions at once — whether the mesh is *deployed* and whether it is *up to date* — and
those differ. `diagnose-demo` already flags this ("Reports both deployed AND up-to-date —
they differ") but has one table row to say it in. An agent that conflates them redeploys a
healthy mesh or leaves a stale one running.

Content:

- The two states `check_mesh` reports and why a mesh can be deployed AND stale.
- What staleness means: local config diverged from what is deployed.
- When redeploying is the answer and when it is not.
- `delete_mesh` is destructive and remote — the recovery is a redeploy, not an undo.

**RED:** same shape as step 05 — count pin 14 → 15, frontmatter parses, inspector
classifies it `demo-builder`.

---

## 6b — The prerequisites decision

**The gap:** `prerequisites` has **0 tools and 0 skills** — the only functional feature with
no agent surface whatsoever. An agent cannot check or install a prerequisite.

This is visible today as a dead end in `diagnose-demo`: of its seven symptom rows, "Project
will not start" is the only one routing to a human step (the Debug Logs channel) rather than
a tool, because no tool exists.

**Decide, then record the decision:**

**Option A — expose a read.** A `check_prerequisites` tool reporting what is installed and
what is missing. Reading tool versions is side-effect-free and squarely headless-safe. It
turns the dead row into a real route.

**Option B — declare it human-only.** Installing toolchains headlessly is a different risk
class: version managers mutate shell state, installs need elevated permissions, and a
half-finished install is worse than none. If that is the answer, say so.

**Recommended: A for reading, B for installing.** The two halves are not the same risk.
Reporting what is missing is exactly what a diagnosis needs; performing the install is
where the danger lives.

Either way, **`diagnose-demo` must stop dead-ending.** Under A, the row routes to the new
tool. Under B, the row says explicitly that this check is human-only and why — an
acknowledged boundary, not an apparent oversight.

**RED:** if A, follow step 03's read-tool shape including the no-writes-in-a-read assertion
(a prerequisites check must never install as a side effect of being asked). If B, assert the
`diagnose-demo` template names the boundary.

---

## Done when

- Mesh skill written; count pin at 15 (or 14 if 6b adds no skill).
- Prerequisites decision made, recorded in this file with its reasoning, and reflected in
  `diagnose-demo`.
- No dead-ending row remains in the routing table.
- `gate` green.

## Notes

If 6b lands as option A, its tool belongs to step 03's pattern but ships here, because the
decision and the tool are one thought. Note it in step 01's coverage table either way —
`prerequisites` having no handler map at all is itself a finding the inventory should carry.
