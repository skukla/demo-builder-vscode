---
id: AI-71
kind: fix
area: ai
needs: []
value: low
status: backlog
---

# An agent's project delete ignores the "deleteAll" setting

Filed 2026-10-10, found while working PL-70 batch MUT-02 on `deleteProjectTool.ts`.

AI-9's answer (owner, 2026-09-19) says the two cloud choices on `delete_project`
honour `demoBuilder.cleanupBehavior`: "`deleteAll` makes them default true,
`localOnly` refuses them. One setting governs both surfaces."

The `localOnly` half works. The `deleteAll` half does not, for an agent.

`resolveCloudCleanup` (`src/features/ai/server/agentProjectCleanup.ts`) implements
it: under `deleteAll` it returns `request.deleteGithubRepo ?? true` for each choice.
But its only caller, `deleteProjectTool.ts`, builds the request as
`deleteGithubRepo: args?.deleteGithubRepo === true` (and the same for
`deleteDaLiveSite`). An absent argument therefore arrives as `false`, never as
`undefined`, and `false ?? true` is `false`. So with the setting at `deleteAll`, a
plain `delete_project` call deletes the local project only, where the button, with
the same setting, ticks both boxes.

`agentProjectCleanup.test.ts` passes because it calls the resolver with `{}`
directly, which the tool never does.

## Recommendation

Pass the argument through only when it is a boolean, and leave it undefined
otherwise, so the resolver's default applies. In the same change, reword the two
input descriptions, which say "(default: false)": under `deleteAll` that would no
longer be true, and an agent reads that line before deciding what to send. Check
the consent copy for `delete_project` says what will be deleted in that case.

## Why it was not fixed where it was found

The fix makes an agent's plain delete remove a GitHub repository and a DA.live
site on any machine set to `deleteAll`. That is the recorded decision, but it
changes when irreversible cloud deletes happen, and it was found during an
unattended run. It needs the owner present.

The tests added in PL-70 pin only what is true either way: what the tool hands the
cleanup step under `ask`, and the `localOnly` note. Nothing pins the `deleteAll`
behaviour in either direction.
