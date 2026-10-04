# Overnight loop report — 2026-10-04 → 10-05

All work is on `loop/2026-10-04-night3-combined` (both streams merged; full gate
passed: 1,807 suites, 31,410 tests). **Not merged into `feature/erp-integration`
and not pushed** — that is your call. Pushing needs a visual baseline capture
first, because `add-card.css` is new (the css-baseline pre-push check).

## What changes for the SC

| When the SC… | What is different | Item |
|---|---|---|
| Lets an agent edit a storefront page | The agent must ask first: `write_page` and `publish_page` refuse without confirmation and show the consent dialog | (your "Yes" last night) |
| Copies a project from an existing one | Copy reads the exported project file, the same way Import does. Edit keeps its own values and now also carries the datapack and store structure | PL-56e |
| Asks an agent to copy a project | New `copy_project` tool. It carries no credentials | PL-56f |
| Wants to know how moving projects works | New guide: `docs/systems/moving-projects.md` | PL-56g |
| Opens the Storefront Report on a fork of our template | Offered the template's newer code; default answer is No | EDS-13f |
| Uses the AI files in a project | Factual errors from the audit fixed (bundle version 35) | AI-8 |
| Zips, shares or syncs a storefront | No `.env` file at any depth ever leaves the machine | security fix |
| Wants an earlier Claude chat | Sidebar "Pick an earlier chat" opens Claude Code's own list | AI-4b |
| Adds a colleague's storefront | Demo Builder checks whether the SC can read the authored site, and says who must grant what | EDS-22 |
| Adds an integration | The header "Add" button is gone; a dashed "+ Add an integration" card sits at the end of the grid. The Welcome step's add-demo card is the same component | PL-62 |
| (nothing visible) | Three oversized files split by job; nine duplicate tests removed; agent-built parts of "import a colleague's integration" written but not wired | EDS-8, PL-42, AB-22 steps 1-3 |
| (nothing visible) | UI tests in a real VS Code now cover two screens in one run — **built, not run** (needs a VS Code download) | PL-66 |

## Walkthrough queue (things only you can check)

1. **Integrations screen**, card and list view: the dashed add card is last, hovers, takes keyboard focus, and hides while filtering.
2. **Welcome step**: "Add a demo package" card, before and after choosing a package.
3. **Run `npm run test:ui`** once. It downloads VS Code 1.136.1 and ChromeDriver and opens a window. Still unproven until then: the stuck-keyboard fix and that hidden webviews are never read by mistake.
4. **Sidebar → "Pick an earlier chat"** opens the past-chat list.
5. **Agent edits a page** → the consent dialog appears.
6. **Copy from existing** on a real project: values, datapack and store structure come across.
7. **Add a colleague's storefront** you can and cannot read: the message names who grants what.
8. Earlier live checks from the 2026-10-04 report still stand.

## Decisions waiting on you

Recommendation first in each.

1. **Merge the combined branch into `feature/erp-integration`?** Recommend yes after items 1-2 of the walkthrough.
2. **Fork catch-up cannot be undone from Demo Builder** (property 1 finding). Git still has the old code, but the SC has no button back. Recommend: record the pre-merge commit and offer "Undo catch-up" in the same report.
3. **Copy no longer carries credentials.** Recommend a follow-on that copies keychain values with explicit consent (D24).
4. **Teach `copy_project` in the AI files?** Recommend yes (next AI_CONTEXT_VERSION bump).
5. **`write_page` "don't ask again"?** Recommend no — publishing is public.
6. **Your Projects' "New" as a card:** open the same three-choice menu (recommended) or one card per choice?
7. **Unused DA.live access functions:** keep `revokeUserAccess` (it undoes a grant), delete `hasUserAccess` and `getPermissionsStatus`.
8. **Add card choices to confirm:** hidden while filtering; not counted; the empty screen keeps its own button.
9. **AI-audit guidance rows**, **EDS-13g's eight decisions** (`.rptc/research/headless-own-repository/research.md`), **AB-22 step 4** (where settings live), the **"Built on" card line**, and the **AI-4b fallback picker**.
10. Still open from before: the catalog menu (tabled), whether to cut a Demo Builder release, Data Installer write access.

## Record

- Backlog check passes (258 items). Every tonight commit is logged.
- Hygiene scan: one stale citation fixed (PL-56b). Three others point into the ERP and integration repos and are not errors. Two items whose cited code moved tonight (export, import) were moved by PL-56e itself.
- Commits: `2bad0aeca`, `361bbe56f`, `d672ddd0f`, `0f4d01ba2`, merge `1168914ce`, plus backlog log commits.
