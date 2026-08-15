# Step 04 — Expose the qualifying ACTION tools

**Kind:** TDD
**Depends on:** step 03
**Touches:** `src/features/ai/server/actionDescriptors.ts`, its suite,
`tests/features/dashboard/handlers/dashboardHandlersMap.test.ts`,
`docs/systems/mcp-server.md`

## Goal

Turn every `expose:action` disposition into a descriptor row. Separate from reads because
these change the user's project, and the review question is different.

## RED

Per tool, in `tests/features/ai/server/actionDescriptors.test.ts`:

- Row exists, correct map and type.
- **Destructive operations carry `confirm: true`.** Assert it explicitly. Deleting or
  undeploying without it is the defect this catches.
- **Guards are reused, not inlined.** Adobe-touching actions go through the existing chain
  (`runGuards`: auth → org-mismatch → developer role). Assert the guard is invoked; do not
  accept a hand-rolled org comparison. Reference: the `adobe-org-context` skill exists
  because ad-hoc org checks were the recurring bug.
- **State persists only after the side effect succeeds** — the `add_console_apis` pattern.
  Assert that a failed operation leaves no record behind.

If any new handler is added to `dashboardHandlers`, its count pin moves: bump the number
AND extend the arithmetic comment so the next reader can reconstruct it.

## GREEN

Add rows to `ACTION_DESCRIPTORS`, mirroring the existing shape and adding `confirm: true`
where destructive.

## The judgment call worth making explicitly

An action tool lets an agent change a user's project without a human in the loop. For each
one ask: **if this fires by mistake, what does recovery look like?**

- Recoverable and cheap (redeploy, resync) → expose.
- Recoverable but slow (reset, reinstall) → expose with `confirm: true`.
- Not recoverable (delete a repo, drop remote content) → `confirm: true` at minimum, and
  consider whether `never:by-design` is the honest answer instead.

Existing precedent to follow rather than re-litigate: `delete_github_repo` and
`cleanup_dalive_site` already exist as tools, so destructive-with-confirmation is an
accepted pattern here.

## Done when

- Each `expose:action` handler has a row and tests, destructive ones pinned to `confirm`.
- Coverage test clean.
- Handler-count pins updated where touched.
- `docs/systems/mcp-server.md` updated.
- `gate` green — and the FULL suite, since handler-map pins are easy to miss with a scoped
  run.

## Notes

`withToolLogging` wraps every tool and logs the name plus argument KEYS only, because
arguments can carry secrets. Do not add value-logging inside any handler these rows reach.
