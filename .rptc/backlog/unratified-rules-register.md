---
id: PL-28
kind: question
area: platform
needs: []
value: high
status: active
---

# Rules stated as law in a CLAUDE.md that no handbook, ADR or check backs

The register for the documentation synthesis. Every per-directory `CLAUDE.md`
carries rules; some are ratified conventions, and some are one directory's prose
wearing a "❌". Until each is adjudicated, this file is where they live.

## The discipline — discovery is not adjudication

Found while rewriting `src/core/CLAUDE.md`: a rule stated as absolute law, present
in no handbook entry, no ADR and no convention, enforced by nothing, and already
violated seven times. The first response was to rewrite it as "intent, not fact",
which demoted a rule without the authority to do so and left it neither enforced
nor removed — the soft deprecation this repo forbids. The owner caught it.

So, for the rest of the synthesis:

1. **Never weaken a rule you find.** Leave the file's statement exactly as it
   stands. A rule in a weakened state is worse than either a ratified one or a
   deleted one, because nothing signals which it is.
2. **Record it here** with the four facts that decide it (below). Gathering them is
   mechanical and takes about a minute.
3. **Keep rewriting everything else in the file.** A rule pending adjudication does
   not block the rest of the document.
4. **Adjudicate in one pass at the end**, so seven rules get one consistent
   decision rather than seven inconsistent ones.

Nothing is removed from any file by this process. The statement stays put; only
this register grows.

## The four facts

For each rule, answer these before proposing anything:

| | |
|---|---|
| **Stated where** | file and line |
| **Ratified?** | does the handbook, an ADR, or the conventions index carry it |
| **Enforced?** | is there a test, hook, or lint rule — checked by PLANTING the violation, never by grepping for a keyword |
| **Obeyed?** | does the code actually follow it today, and if not, how many exceptions |

The fourth is the one that changes the answer most often, and the one nobody
checks. A rule the code already violates is not a rule.

## Outcomes

Exactly two, and "leave it as prose" is not among them:

- **Ratify** — into the handbook, with an enforcer, and a shrink-only ledger for
  whatever predates it. Both scorecards and the generated index move together.
- **Delete** — remove the claim outright and say in the file that the thing is
  unrestricted.

## The register

| # | Rule | Stated where | Ratified? | Enforced? | Obeyed? | Outcome |
|---|---|---|---|---|---|---|
| 1 | Nothing under `src/core/` imports `@/features` or `@/commands` | `src/core/CLAUDE.md` | no → **now yes** | no → **now yes** | no, 7 crossings | **Ratified** 2026-08-30. Handbook convention + `layerDirection` ledger, shrink-only |
| 2 | Extract shared UI at the **third** instance — **but at the second** when the same behaviour has already been fixed separately on two surfaces, because that is demonstrated drift | `src/core/ui/components/CLAUDE.md` | **no** — absent from the handbook and the conventions index | **no** | unmeasured | **Pending** |

**Row 2 detail.** The plain Rule of Three is ordinary practice and would not be worth
a row. The *override* is the decision: it lowers the threshold to two on evidence of
drift, which is a genuine judgement about when duplication is proven rather than
suspected. It is stated once, in one directory's prose, and nothing carries it
anywhere else.

Adjudicating it needs an answer to a question nobody has asked yet: **is it
obeyed?** That means finding cases where the same behaviour was fixed twice on two
surfaces and checking whether it then got extracted. Until that is measured, ratify
and delete are both guesses — which is exactly why it sits here rather than being
decided in passing.

Files assessed so far: `src/commands/CLAUDE.md` (no unratified rules found — its
content was stale rather than prescriptive), `src/core/CLAUDE.md` (row 1).

Still to assess: `src/features/CLAUDE.md`, `src/features/sidebar/CLAUDE.md`,
`src/features/projects-dashboard/CLAUDE.md`, `src/core/ui/hooks/CLAUDE.md`,
`src/core/ui/components/CLAUDE.md`, `docs/development/styling-guide.md`,
`tests/README.md`, `CONTRIBUTING.md`,
`docs/testing/test-file-splitting-playbook.md`, `docs/systems/mcp-server.md`,
`docs/troubleshooting/*`.

## Why this is a question, not a chore

It closes when every per-directory document has been through the synthesis and
every row has an outcome. The count is not knowable in advance — that is the point
of keeping the register rather than estimating.
