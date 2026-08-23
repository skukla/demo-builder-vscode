# Step 04 — The orchestration skill

**Gated on:** step 03. **Invoke the `ai-context-authoring` skill** — it owns the four gate
seams and the version discipline that keep existing projects from stranding.

## Goal

A generated skill that teaches a project's agent the whole loop, so the capability is
reachable by asking rather than by knowing the tool names.

## Where

`src/features/project-creation/templates/skills/` — alongside `import-datapack.md` (156
lines), which already covers import, reset, validate and export.

**Decide first: new skill or extension of `import-datapack`?** The recommendation is a new
skill. `import-datapack` answers "seed this demo with data"; the authoring loop answers
"make my own pack". They share tools but not intent, and a 156-line skill that grows to
~300 stops being read. Record whichever way it goes at the top of the file.

`inspectSkills` walks `.claude/skills/` and classifies what it finds, so a new template
appears in the AI Capabilities modal with no extra wiring.

## What it must teach

**Route B, the one that works:**

1. `batch_get_datapack_items` the source rows from the pack the project seeded from — the
   project already records that (`SampleDataStep`).
2. `create_datapack` a private pack: `shared: false`, the user as owner, an explicit
   version.
3. `add_datapack_item` / `update_datapack_item` the edited rows.
4. `promote_datapack_version` once the set is coherent — **the commit**.
5. `validate_datapack_import` then `start_datapack_import` onto a scope to verify.

**The atomicity rule, stated plainly:** edits accumulate on a working version; promote
once. Do not mint a version per edit. `(name, version)` is the pack's identity and a
duplicate is a 409.

**Route A, gated.** Say that instance-first capture exists, that `start_datapack_export`
is the tool, and that **it currently fails at the service's store step** — so do not walk a
user into it. Remove the gate only when step 05 records a successful export.

**The two export traps already documented in `import-datapack`**, if the new skill mentions
export at all: the service does not order export for you (`get-processor-order` with
`operationMode: "export"`), and re-exporting a data type rewrites it in the pack.

## Version discipline

`AI_CONTEXT_VERSION` is **18** (`src/core/constants.ts:138`). A new generated skill is a
bundle change, so it bumps to **19** — otherwise existing projects never regenerate and the
capability ships only to projects created after it. The `ai-context-authoring` skill states
which of the four seams must move together; follow it rather than this paragraph.

## Tests

- Creation and regenerate both emit the skill — the desync this discipline exists to catch.
- The skill's frontmatter parses and classifies as `demo-builder`.
- A test pins that Route A is marked gated, so removing the gate is a deliberate edit.

## Definition of done

- Skill written, `AI_CONTEXT_VERSION` bumped, regenerate parity proven.
- `gate` green.
