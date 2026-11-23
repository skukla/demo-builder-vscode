# Loop report, 2026-11-23 (in progress)

Branch: `loop/2026-11-23-backlog`, off develop at f192aa490, pushed for backup. Nothing is on
develop; merging is your decision.

## The takeaway

The loop worked the backlog's smallest items that need nothing from you, smallest first. Ten are
built on the branch, one more is researched, each with the full checks passing and a review filed. Three need you: one
was refused by the permission check, one turns out to be satisfied already, and one is a real bug
whose fix needs a design choice, now written into the item.

## Shipped (on the branch, waiting for a merge)

| Item | What changed | Kind |
|---|---|---|
| AB-89 | The several-ERPs plan describes the tabbed Admin page that shipped, and closes the two open questions it settled | all done here |
| PL-72 | The result builders' failure-flag suite is named for its module, so mutation testing can count it. Measuring it is the overnight run's job | done up to your part |
| AI-80 | `read_debug_logs` takes several words (any, or all with `matchAll`), and the echoed words count against its size cap | all done here; live check after merge |
| PL-109 | The record scan reads its files in one pass: 16 s to 1.5 s, output identical to the old scan | all done here |
| PL-112 | eslint fails any `as any` or `as never` (and their arrays) in tests; the emptied ceiling suite is deleted; the convention proof passes | all done here |
| PL-116 | Both mutation scripts use one rule for which suites are a module's own. Nine modules move from included to blocked; each had been credited a same-named module's suite. No pinned measurement moves | all done here |
| PL-120 | Re-measured `authentication/services` (45 files): verdict leave, new bar 50. Four Adobe I/O Events files are the one subfolder candidate | all done here |
| AI-79 | All 20 untriaged handlers judged in the coverage scan: 8 reach an agent under another name, 12 are screen plumbing, 2 are new gaps | all done here |
| PL-98 | One question-table shell for the projects list's Delete, Reset and Updates windows; markup unchanged, 978 tests pass, one new assertion | all done here |
| PL-115 | 33 test files use the shared WebviewClient fake (only the recorded exception keeps its own); the import-order check was blind to the new import form and now sees it | all done here |
| AI-78 | Researched, not built: our MCP library has an older experimental "tasks" shape than the one Claude Code reportedly supports, nothing found for Copilot; keep the 45 s wait (`.rptc/research/mcp-tasks-for-long-jobs/`) | research |

## Handed off

- **PL-110** (dead entries in the hook router's pre-filter): checked true, but the permission check
  refused editing the hook router while you are away. The exact change is in the item's log.
- **EDS-76** (reset and creation record the storefront's state from current configs, not what they
  published): checked true. Not a one-line fix: during a reset the mesh redeploy can republish and
  record its own state, which an earlier snapshot would overwrite. The design is in the item's log.

## Corrected along the way

- AI-80's first version let ten long search words push a response past its size ceiling; the review
  caught it and it was fixed before commit.
- PL-109's first fast version differed from the old scan on section 6 (merge commits); the folder
  log now uses git's combined diff and the cited files keep one log each, and the output matches.
- PL-112's first eslint rule missed `as any[]`; fixed, and a handbook edit had made the generated
  conventions index name eslint as an unrelated rule's enforcer; fixed.

## Your decisions

1. Merge `loop/2026-11-23-backlog` into develop?
2. PL-110: apply the router change yourself, or allow the loop to edit hooks?
3. PL-121: the ledger already records why each of the three new pushes must push (all progress
   lines). Close it? (Recommended.)
4. AI-79's two new gaps: should an agent be able to run the recorded-datapack check on its own, and
   the share check for a project without Edge Delivery?
