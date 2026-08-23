# Step 05 — Org-context skill for generated projects

**Kind:** TDD + generated bundle
**Touches:** `src/features/project-creation/templates/skills/`, `skillsWriter.ts`,
`src/types/ai.ts`, `src/core/constants.ts`, the skills suites

## Why this one first among the skill gaps

`authentication` is the largest un-guided cluster on the surface: **8 tools, 0 skills** —
`get_auth_status`, `sign_in`, `list_orgs`, `list_adobe_projects`, `list_workspaces`,
`select_org`, `select_project`, `select_workspace`.

And the asymmetry is stark: THIS repo carries an `adobe-org-context` skill for developers,
written because org handling is the most error-prone area in the codebase — IMS tokens are
org-bound, and ad-hoc org comparisons were a recurring source of bugs. Generated projects
ship an agent eight org-shaped tools and no equivalent guidance.

## Goal

One skill — working name `adobe-org-context` — teaching a project's agent the model:

- IMS tokens are **org-bound**; a token minted for one org does not work against another.
- How to read the current context before acting (`get_auth_status`).
- Why per-operation targeting exists rather than a global "current org".
- What an org mismatch looks like in a tool result, and the recovery (forced re-login), as
  distinct from an expired token.
- Which of the eight tools answers which question.

Source material is the developer-facing `.claude/skills/adobe-org-context/` skill. **Do not
copy it.** That one is about the extension's internals (`ensureOrgContext`,
`detectProjectOrgMismatch`, `withOrgContext`); the generated one is about the TOOLS an
agent can call. Same model, different audience.

## RED

`tests/features/project-creation/services/skillsWriter.test.ts`:

- The new file is written for every project type — this is not conditional; any Adobe
  project can hit an org mismatch.
- The always-on skill COUNT pin moves 13 → 14. Bump the number and its derivation comment.
- Frontmatter parses: `name` and a `description` that says WHEN to use it (the description
  is the whole discovery surface — Claude auto-discovers skills from it).

`tests/features/ai/skillInspector.test.ts`:

- The new filename classifies as `demo-builder`, driven by
  `DEMO_BUILDER_ALWAYS_ON_SKILLS`. Since the writer builds from that constant and the
  inspector reads it, adding the name in one place must satisfy both — assert it does.

## GREEN

1. Write `templates/skills/adobe-org-context.md`.
2. Add the filename to `DEMO_BUILDER_ALWAYS_ON_SKILLS` (`src/types/ai.ts`) — the single
   home — and its content to `SKILL_CONTENT` in `skillsWriter.ts`. A missing content key is
   a compile error, by construction.
3. **Bump `AI_CONTEXT_VERSION`** and record what the version added in the comment above it.

## Bundle discipline

Per `ai-context-authoring`: the bump is what makes existing projects notice. Without it
they never learn the bundle changed — no badge, no regenerate prompt, silent staleness.

Regenerate parity: creation and regenerate must produce the same file set. This skill is
unconditional, so it should be automatic — but verify rather than assume.

## Done when

- Skill written, count pin at 14, inspector classifies it first-party.
- `AI_CONTEXT_VERSION` bumped once for steps 05–07 combined (see the overview: land them
  together so users are prompted once, not three times).
- `src/features/ai/README.md` and `src/features/CLAUDE.md` skill lists updated.
- `gate` green.

## Notes

Keep it short. Every skill is context every agent pays for on every project. This one earns
its place by covering eight tools; a skill covering one would not.
