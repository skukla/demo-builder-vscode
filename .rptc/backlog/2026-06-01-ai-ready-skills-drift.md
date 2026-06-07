# AI Ready: surface skills drift as amber

**Filed:** 2026-06-01
**Origin:** AI Chat session reported `register-custom-block` missing from `.claude/skills/`.
The skill template lives in `src/features/project-creation/templates/skills/`
and was added after this project was created — so the project's skill set is
stale, and the user had no signal of that until an agent hit the gap.

## Symptom

A user's project has an outdated `.claude/skills/` set: the extension shipped
new skill templates (or modified existing ones) since the project was created,
but the project's local copies were never refreshed. Agents fail to load
skills they expect to exist; users only discover the drift mid-task.

The "AI Ready" badge on the project Dashboard currently goes green when MCP
inventory + verify checks pass. It says nothing about whether the project's
skill set matches the templates this extension version ships.

## Why it happens

Skills are scaffolded by `src/features/project-creation/services/skillsWriter.ts`
at project creation time only (via `writeSkillFiles`). The auto-update system
handles component drift via the `componentUpdater` snapshot/rollback flow, but
nothing reconciles `.claude/skills/` against the current `templates/skills/`
directory on extension update.

## Goal

When the project's `.claude/skills/` differs from the extension's current
skill template set, the **AI Ready badge goes amber** (existing yellow state,
new text) with a tooltip naming what's stale and pointing at the
"Regenerate AI Files" action. Running regenerate brings the set in line and
returns the badge to green.

## What this would require

1. **A drift detector.** Add `detectSkillsDrift(projectPath): { missing: string[]; outdated: string[] }`
   to `skillsWriter.ts`. `missing` = template names with no file in the project.
   `outdated` = files whose content hash differs from the shipped template.
   First slice: `missing` only. Hash-based `outdated` is a follow-up if
   content drift turns out to matter — start with the cheaper, higher-signal
   case.
2. **Plumb the result through verify.** Extend the AI verify result's
   `inventory` shape with `skillsDrift?: { missing: string[]; outdated: string[] }`.
   Compute it in whichever handler builds `verifyResult.inventory` (search for
   `skillsError` to find the existing shape).
3. **Add a yellow branch to `useDashboardStatus.ts`.** Insert before the green
   return in the `aiReady` `useMemo` (lines ~357–380):
   ```ts
   if (inv.skillsDrift?.missing?.length || inv.skillsDrift?.outdated?.length) {
       return { label: 'AI Ready', color: 'yellow', text: 'Skills outdated' };
   }
   ```
4. **Tooltip / modal copy.** The existing `AiCapabilitiesModal` already lists
   skills; render the drift list there with a "Regenerate AI Files" call to
   action. No new modal surface needed.
5. **Tests.** Cover the drift detector (missing, present, content-differs)
   and the `aiReady` memo's new branch.

## Scope guardrails

- One-way detection: extension → project. We do not warn when a project has
  *extra* skills the templates don't ship (users may add their own skills).
- Detector reads templates from the running extension's installed location,
  not from disk lookups outside the extension — keep the file resolution
  through the same path `skillsWriter` already uses.
- The badge stays a hint, not a blocker. Agents that need a missing skill
  will still discover the gap when they try to load it — the badge just
  removes the surprise.
- Do not auto-regenerate on activation. Regeneration overwrites; the user
  must opt in via the existing button.

## Suggested first-cut slice

Smallest shippable: detector for `missing` only, plumb through verify,
wire the yellow branch, show the list of missing names in `AiCapabilitiesModal`.
Skip hash-based `outdated` detection until field evidence shows it matters.

## Tests to add

- `detectSkillsDrift`: no project skills dir → all templates missing;
  full match → no drift; partial → only the absent ones listed.
- `useDashboardStatus` `aiReady`: drift → yellow "Skills outdated"; no drift
  + clean inventory → green; drift + inventory error → drift wins (yellow
  with skills-specific copy is more actionable than the generic
  "Setup incomplete").

## Related

- [[2026-05-30-decouple-project-from-workspace]] — different gap, same
  workspace-anchor surface.
- `componentUpdater` — the prior-art pattern for drift detection +
  snapshot/rollback. A future extension could share infrastructure.
