---
id: AI-9
kind: question
area: ai
needs: []
value: med
status: active
---

# Should an agent's project delete also clean up the cloud, as a person's does?

A person deleting a project and an agent deleting one do different things.

- **A person** (dashboard or projects-list kebab) runs `deleteProject` in
  `src/features/projects-dashboard/services/projectDeletionService.ts`. For an EDS
  project it unpublishes the CDN content, deletes the DA.live site, and deletes the
  GitHub repo (asking first), then the local files. One action, back to zero.
- **An agent** calls `delete_project` (`src/features/ai/server/deleteProjectTool.ts`),
  which runs `deleteProjectFiles`: it stops the demo, deletes the project folder and
  forgets the project. Nothing in the cloud. This is **by design** — the tool's
  description says it "does NOT delete cloud resources", and the file's header says the
  agent uses `delete_github_repo` and `cleanup_dalive_site` for those.

Read 2026-09-19, while planning PL-59 phase 2 (its routing table, row 5b).

## Why it is a question

The first property this repo holds is that whatever can be done can be undone and an
SC can return to zero. An agent that deletes only locally leaves a live site, a DA.live
site and a GitHub repo with no project left in the extension to manage them — unless it
remembers two more tool calls. **No agent tool for the CDN unpublish step was found** in
a quick look; that was not a thorough search, and the first thing to do here is a
proper one.

Answers it could have:

1. **Keep it local-only**, and make the gap impossible to miss: the tool's answer names
   the cloud resources left behind and the tools that remove them.
2. **A full delete for agents**, the same steps as the button, behind the same
   `confirm` + `confirmName` gate. The GitHub-repo deletion the button asks about would
   need its own explicit argument, since an agent cannot answer a dialog.
3. **Both**: local by default, full with an explicit argument.

Whichever is chosen, PL-59 phase 2 gives the agent's delete the same stage names as the
button's, so it can show its steps.

## Answered 2026-09-19: mirror the choice the button already offers

The question assumed the button does a full teardown. It does not. Reading
`showCleanupConfirmation`, a person deleting an EDS project gets a checklist with
**both boxes unticked** — "Delete Repository" (`owner/repo`) and "Delete DA.live Site"
(`org/site`, which is also what unpublishes the CDN content) — over the setting
`demoBuilder.cleanupBehavior` (`ask` by default; `deleteAll` ticks both, `localOnly`
never asks). Press Enter without ticking anything and the button deletes locally,
which is exactly what the agent does today.

So the difference was never policy. It was that the agent had no way to say "and those
two as well". The decision (owner, 2026-09-19) is to mirror the checklist:

- `delete_project` takes `deleteGithubRepo` and `deleteDaLiveSite`, both defaulting to
  false — the same two choices, unticked, behind the existing `confirm` + `confirmName`
  gate.
- Both honour `demoBuilder.cleanupBehavior`: `deleteAll` makes them default true,
  `localOnly` refuses them. One setting governs both surfaces.
- An unasked-for delete therefore does what it does today, and a full teardown is one
  call rather than three.

**The gap this search DID find, and it is a defect rather than a design question:**
`cleanup_dalive_site` calls `deleteAllSiteContent`, which deletes DA.live SOURCE
documents only. The CDN unpublish lives in `projectDeletionService` alone
(`helixService.unpublishPages`). So an agent can delete the repo, the DA.live content
and the local project and still leave the storefront live on aem.live — its only other
route is `delete_page`, one page at a time. The unpublish moves into the shared DA.live
teardown so both surfaces do it.

## Shipped so far

- 2026-09-19  docs(backlog): AI-9, should an agent's project delete also clean up the cloud (`6f8315213`)
- 2026-09-20  Answered: mirror the button's checklist as two args on delete_project; the CDN unpublish gap is a defect to fix (merge 7f69e91cc)
- 2026-09-20  feat(delete): the project delete narrates, and an agent can finish the job (`41fe0fc86`)
