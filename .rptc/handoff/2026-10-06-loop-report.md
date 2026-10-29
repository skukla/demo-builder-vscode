# Second loop report — 2026-10-05

**Summary.** Ten items worked. **Four closed** (status set to built): the demo-data
skill, Save to GitHub, adding is a card everywhere, and the test-setup cleanup.
Three more reached your live check or decisions; two are research with a design
waiting on you; two are ongoing cleanups. Everything is on
`loop/2026-10-05-night4-combined` — full gate passed (1,816 suites, 31,479 tests).
**Not merged into `feature/erp-integration`, not pushed.** Two stylesheets changed
(`add-card.css`, `ai.css`), so a push needs the visual baseline capture first.

## What changes for the SC

| When the SC… | What is different | Item | State |
|---|---|---|---|
| Picks an empty repository an organization made for them | Setup now works: it writes a first commit, then applies the template | EDS-17 | to your live check |
| Is refused by a GitHub organization | Told what to do (authorize single sign-on, ask the org to approve the app, ask an owner for a repository) instead of "Access denied" | EDS-17 | to your live check |
| Asks their agent to build demo data from a brief | A new skill in every project's AI files guides the agent: plan first, safe order, check shoppers can see it, an undo list. Commerce tool failures are now clearly marked as errors | AI-10 | **built** |
| Wants to share a custom app built from the blank starter | "Save to GitHub" on its card: pick account or org, confirm (public, file count), one commit. Undo deletes the repository and makes it a starter again | AB-1c | **built**, first real run is yours |
| Adds anything | A dashed add card on every grid: Your Projects (opens New / Copy / Import), the prompt library, integrations, demo packages | PL-62 | **built** |
| Wants Optimizer stacks | Design only — five choices are yours | PL-60 | planned |
| Wants a project with only an App Builder app | Design only — three choices are yours | AB-1b | planned |
| Asks how detailed ERP events can be | Research answered; three live checks are yours | AB-60 | open question |
| (nothing visible) | Two more oversized files split; 8 duplicate tests removed; one suite reuses its shared setup | EDS-8, PL-42, PL-51 | PL-51 **built**; the rest ongoing |

## Walkthrough queue

1. **Merge** the combined branch? Recommend yes after item 3.
2. **Organization repositories — decisions** (recommendation first):
   - D1: never delete a repository an org owner made for the SC (record it as adopted). **Safety issue — recommend deciding before merge use.**
   - D2: the wizard's Create button follows the namespace picker.
   - D3: fall back to the personal account only when the target is the SC's own login.
   - D4: list team-reachable org repos by querying the picked org, or let the SC type `owner/repo`.
   - D5: re-read the "storefronts always on main" decision, since adopted repos may not be.
   - Live: adopt an empty org repo end to end; hit a single-sign-on refusal.
3. **Look at** Your Projects (grid and list), the prompt library, and the integrations screen.
4. **Save to GitHub**: one real save on a test app, check the repo, then undo. Keep it public-only? (recommend yes). No MCP tool yet — add one? (recommend yes, confirm-gated).
5. **Demo-data skill**: in a scratch project, paste a brief and watch. Word the one-sentence SC prompt. Keep the Justrite load scripts out of this public repo (recommend).
6. **Optimizer (P1–P5)**: offer it under Commerce → Catalog; ask only tenant id, region, environment, catalog view id, locale and delete the other credentials; data through Data Installer datapacks (delete the old ingestion tool); point the storefront at Optimizer only; per-customer ERP prices become their own item. Plan: `.rptc/plans/aco-support/overview.md`.
7. **App-only project (3 decisions)**: a third option on the Backend step; app addresses shown on the integrations screen and via `get_project`; require an App Builder org. Plan: `.rptc/plans/app-only-project/overview.md`.
8. **ERP events**: three live checks in `.rptc/research/event-payload-granularity/research.md`. New finding: the receiver rejects an event without both `sku` and `price` today.
9. **Keep the dashboard-handlers split?** It overrides an earlier "leave it" note that named the wrong file. Recommend keep.

## Record

- Backlog check passes (258 items). Every commit is logged.
- Two design-only items were moved from "active" to "planned" — they have a plan and no code.
- Hygiene scan: three dead citations point into the ERP and integration repos (not errors). Twelve items now cite code that moved, mostly because of tonight's file splits — advisory; read before working them.
- Commits: `dd6784bb0` (A), `79f8ed297` (B), backlog log commits, and the merge.
