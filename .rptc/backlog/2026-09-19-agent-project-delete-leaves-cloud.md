---
id: AI-9
kind: question
area: ai
needs: []
value: med
status: open
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
