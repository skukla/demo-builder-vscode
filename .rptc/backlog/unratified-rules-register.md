---
id: PL-28
kind: question
area: platform
needs: []
value: high
status: active
---

# Rules stated as law that no handbook, ADR or check backs

The register for the documentation synthesis. Documents across this repo state
rules; some are ratified conventions, and some are one file's prose wearing a "❌".
Until each is adjudicated, this is where they live.

## The discipline — discovery is not adjudication

Found while rewriting `src/core/CLAUDE.md`: a rule stated as absolute law, in no
handbook entry, no ADR and no convention, enforced by nothing, and already violated
seven times. The first response was to rewrite it as "intent, not fact" — which
demoted a rule without the authority to do so and left it neither enforced nor
removed, the soft deprecation this repo forbids. The owner caught it.

So, for the rest of the synthesis:

1. **Never weaken a rule you find.** Leave the statement exactly as it stands. A
   rule in a weakened state is worse than a ratified or a deleted one, because
   nothing signals which it is.
2. **Record it here** with the four facts that decide it.
3. **Keep rewriting everything else in the file.** A pending rule blocks nothing.
4. **Adjudicate in one pass at the end**, so N rules get one consistent decision
   rather than N inconsistent ones.

Nothing leaves any file by this process. The statement stays; only this register
grows.

## The four facts

**Stated where** (file and line) · **Ratified?** (handbook, ADR, or conventions
index) · **Enforced?** (checked by PLANTING the violation, never by grepping for a
keyword) · **Obeyed?** (does the code follow it today).

The fourth is the one nobody checks and the one that most often changes the answer.
**A rule the code already violates is not a rule.**

## Outcomes

Exactly two. "Leave it as prose" is the state this register exists to end.

- **Ratify** — into the handbook, with an enforcer, and a shrink-only ledger for
  whatever predates it. Both scorecards and the generated index move together.
- **Delete** — remove the claim and say in the file that the thing is unrestricted.

## The register

| # | Rule | Stated where | Ratified | Enforced | Obeyed | Outcome |
|---|---|---|---|---|---|---|
| 1 | Nothing under `src/core/` imports `@/features` or `@/commands` | `src/core/CLAUDE.md` | now **yes** | now **yes** | no — 7 crossings | **Ratified** 2026-08-30 · `layerDirection` ledger, shrink-only |
| 2 | Extract shared UI at the third instance — **but at the second** when the same behaviour was already fixed separately on two surfaces | `src/core/ui/components/CLAUDE.md` | no | no | unmeasured | Pending |
| 3 | A destructive tool requires `confirm: true` — deletes, or pushes to a live site. Merely mutating is deliberately not the bar | `docs/systems/mcp-server.md` §10 | no | partly — the registrar checks the flag, nothing checks the right tools carry it | unmeasured | Pending |
| 4 | Every tool returns one envelope, built by `mcpToolResult.ts` and never by hand | `docs/systems/mcp-server.md` §10 | no | **yes** — `responseEnvelope.test.ts` | yes | Pending — enforced but uncatalogued |
| 5 | A tool needing credentials pre-flights and returns a `needsAuth` handoff rather than erroring | `docs/systems/mcp-server.md` §10 | no | no | unmeasured | Pending |
| 6 | Naming: commands `camelCase`, components `PascalCase`, constants `UPPER_SNAKE_CASE`, filenames matching the export | `docs/CLAUDE.md` | no | no | visibly followed | Pending |
| 7 | When a parent selection changes, clear all state downstream of it | `docs/CLAUDE.md`, `hooks/CLAUDE.md`, `patterns/state-management.md` | no | no | unmeasured | Pending |
| 8 | Feature configuration loads through `ConfigurationLoader`, not direct reads | `where-code-goes.md` row 9 | no | **no** — the named enforcer never existed | unmeasured | Pending |
| 9 | New project-state metadata defaults to the "main" environment rather than the project root | ADR-003 | no | no | 11 sites do | Pending |
| 10 | A new function depending on `daLiveOrg`/`daLiveSite`/workspace takes them as PARAMETERS, not from project state | ADR-003 | no | no | unmeasured | Pending |

### Which of these are cheap, and which need a measurement

**Rows 3–5 are cataloguing, not judgement.** They are stated in a document calling
them conventions new tools *must* follow, and row 4 already has a build-failing
enforcer. The question is not "is this real" but "why is an enforced convention
absent from the place that catalogues conventions". Row 4 means the scorecard
undercounts what this codebase actually enforces — as `Pattern B` did before it was
catalogued on 2026-08-30.

**Row 7 has teeth and is stated in three places.** A stale child selection is how an
operation targets the wrong resource: change the Adobe project, keep the old
workspace, and the next deploy goes somewhere nobody chose. That is the failure
`withOrgContext` and the org-mismatch guard exist for. Measure how many selection
handlers actually clear their dependents before deciding how to ratify it.

**Rows 9 and 10 are forward-compatibility disciplines**, which is the kind that decays
most quietly: nothing breaks today when one is skipped, and the cost lands years later
as a retrofit. ADR-003 claimed both were "stated as rules in the handbook" — the
handbook has never mentioned multisite, and the anchor pointed at a heading that does
not exist. Claim corrected; the rules registered rather than dropped.

Row 9 is the cheaper one to settle: the ADR says 11 sites already default a new field
to `main`, so the obeyed column is nearly answered.

**Row 8 is an enforcement gap, not a rule gap.** The rule is real and sits in the
placement table every agent is pointed at — but the enforcer named beside it was
never written, so the table asserted a guarantee it did not have. The claim now says
so; writing the check is the open work. `where-code-goes.md` sets the standard
itself: if a rule and its test disagree, that is a bug in one of them.

**Row 2 needs the obeyed answer first.** The plain Rule of Three is ordinary
practice. The *override* is the decision, and adjudicating it means finding cases
where one behaviour was fixed twice on two surfaces and checking whether extraction
followed. Until that is measured, ratify and delete are both guesses.

**Row 6 is the opposite of row 7** — low stakes, visibly obeyed, cheap either way.
Do not spend equal effort on them.

## Resolved without a row

- **`Pattern B`** — a handler returns its result; `sendMessage` is for progress only.
  Named in fifteen files, defined in none, and carrying a build-failing ratchet
  (`patternBSendMessageCeiling`). Catalogued into the handbook and the glossary
  2026-08-30. Conventions 63 → 64, enforced 57 → 58.
- **`hook-stable-refs`** — claimed by `where-code-goes.md` as an
  `architecture-rules` check. Real, but in `webview-architecture-rules.test.ts`,
  because hooks are webview code and ADR-017 governs them. Label corrected.

## Why a question, not a chore

It closes when every document has been through the synthesis and every row has an
outcome. The count is not knowable in advance — which is the point of keeping the
register rather than estimating.

## Shipped so far

- 2026-08-30  docs(adr): fix a false handbook claim, and check anchors at all (`0bbd56a16`)
- 2026-08-30  docs(architecture): two enforcer claims were wrong; correct both, register one (`e036ac0cb`)
- 2026-08-30  docs(docs): shrink docs/CLAUDE.md to what it alone owns, 124 -> 62 lines (`78b376129`)
- 2026-08-30  docs(mcp): point §13 at the skill that supersedes it; register §10's conventions (`915a989ef`)
- 2026-08-30  docs(reuse-first): name the component list what it is, and close its drift vector (`692cf5576`)
- 2026-08-30  docs(backlog): register row 2 -- the Rule of Three override (`1e14e26d2`)
- 2026-08-30  docs(ui): verify the two shared-vocabulary docs; one dedupe, no rewrites (`eb490236c`)
- 2026-08-30  docs(projects-dashboard): rewrite CLAUDE.md, 239 -> 96 lines (`678a08cf9`)
- 2026-08-30  docs(sidebar): rewrite src/features/sidebar/CLAUDE.md, 334 -> 136 lines (`f662a358b`)
- 2026-08-30  docs(features): rewrite src/features/CLAUDE.md, 485 -> 173 lines (`c33ec1d26`)
- 2026-08-30  docs(backlog): open PL-28, the register for unratified rules (`7923bcba1`)
