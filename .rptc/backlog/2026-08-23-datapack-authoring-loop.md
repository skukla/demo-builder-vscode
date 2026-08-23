# Datapack authoring loop — export, modify, publish-your-own via project skills

**Filed:** 2026-08-23, from user direction while closing the Bodea
differentiation question. The Bodea change is this feature's first live test.

## The user story (the spec, verbatim intent)

A user in a Demo Builder project should be able to — via the skills available
to him in that project — **export a datapack, update its data to support his
use case, and publish his own version of that pack.** The agent should have
enough context to recognize **atomic updates to the same pack**. If the task
spans multiple tools, skills, or agents across MCPs or other sources, **the
demo-builder MCP provides the orchestration skills**, and those skills appear
in the skills modal.

## What EXISTS today (verified 2026-08-23, live probe + repo record)

- **Export tools are built and exposed**: `list_datapack_export_items` →
  `start_datapack_export` (confirm-gated; takes datapackName + version +
  commerceInstance + dataTypes), plus the dashboard's `ExportDatapackModal`.
- **The generated `import-datapack` skill already covers the capture
  direction** ("captures data back out into a pack") — project agents have
  import, reset, validate AND export guidance today.
- **Skills modal is automatic**: `inspectSkills` walks `.claude/skills/`, so
  any generated orchestration skill appears in the AI Capabilities modal with
  no extra wiring.
- **The natural atomicity model already fits the service**: the INSTANCE is
  the working copy — N edits (Admin, REST, agent tools) accumulate there —
  and **export is the commit**, capturing the whole state into a pack
  identity in one call. "Recognizing atomic updates" is therefore a skill-
  guidance problem (edit freely, export once, name the version), not a new
  mechanism.

## The gaps (ordered by hardness)

1. **The export store-step lacks `MONGO_URI` on the service's stage
   deployment — a KNOWN, MEASURED deployment gap, not an open question.**
   (A first draft of this item called it an "unexplained defect needing
   owner diagnosis" — that took the plan HANDOFF's stale framing over the
   corrected record. `docs/systems/data-installer.md` §6b measured the root
   cause on 2026-08-14: the export processor fetches instance data fine and
   500s storing it — "MongoDB connection URI required" — which explains
   every observation including the types that "succeed" with zero items.)
   **Re-confirmed live 2026-08-23** via `start_datapack_export` against the
   user's Bodea instance: the two custom customer groups cleared the
   exclusion rules (`excluded: 0`) and failed at the store step with the
   same message. The ask to the service side is a DEPLOY ACTION, five
   minutes, not an investigation: `aio app config set MONGO_URI …` +
   redeploy for the export path (and ideally `COMMERCE_INSTANCE_URL_TEMPLATE`,
   which blocks `get-export-items` instance resolution — same section). The
   secret is the service's own; the extension neither holds nor sends it.
2. ~~"Publish his own version" semantics~~ — **CLOSED 2026-08-23: it is the
   service's DESIGNED workflow** (service docs, distilled in
   `.rptc/research/data-installer-service-docs/research.md`):
   `create-datapack` takes `datapack_name` + `version` + `owner` +
   **`shared: false`** — a user creates his own PRIVATE pack and exports
   versions into it; (name, version) pairs coexist, duplicates 409. Export
   also supports per-type `selections` filters, so the loop can capture
   exactly the changed types. Consequence for the acceptance test: use a
   user-owned private pack (e.g. "bodea-differentiated"), NOT a new version
   of the shared `bodea` — no shared-registry pollution. Remaining sliver
   once gap 1 lands: prove the extension's client path create-then-export
   end to end.
3. **The orchestration skill (and its tools) do not exist yet — and the
   Postman collections define their real scope** (full map in the research
   note): the service has data-item add/update/delete/get + batch-get,
   version PROMOTE, pack update/delete, and async process+poll — none
   exposed as MCP tools today. The loop therefore has TWO routes the skill
   must teach:
   - **Route B (pack-first, works on the shared deployment TODAY):**
     batch-get source rows → write edited rows into a user-owned private
     pack via add-data-item → import to verify. For surgical, known edits.
     `add-data-item` is proven working on stage (§6b).
   - **Route A (instance-first):** edit the instance (Admin deep links for
     what the API cannot reach) → selective export of changed types →
     needs the user's own deployment for a working export store-step.
   Atomicity: item edits accumulate on a working version; **`promote`** is
   the commit. New MCP tools ride the existing `dataInstallerClient`
   (`mcp-tool-authoring`); the skill is `ai-context-authoring` territory
   (generated + version bump); record which pack the project seeds from
   (`SampleDataStep`).
4. **Cross-surface manual steps need the assisted shape.** Shared-catalog
   structure edits happen in the ACCS Admin (no confirmed API surface — see
   the instance-wipe audit). The tabled instance-hygiene design's
   assisted-manual-step pattern (instruct with exact names → Admin deep
   link → verify by API re-read) is the right delivery for those steps
   inside the orchestration skill.

## The acceptance test (the Bodea scenario, end to end)

The user has a running demo connected to an instance with Bodea imported and
will apply the differentiation himself (drop `software`, `wi-fi`,
`critical-power-equipment` from ServerSavvy Solutions — see
`2026-08-17-bodea-shared-catalogs-are-undifferentiated.md`, which this test
also serves):

1. Modify the instance (Admin: Set Pricing and Structure).
2. From the project's agent, create a PRIVATE user-owned pack (e.g.
   "bodea-differentiated", `shared: false`) and export the changed types
   into it (selective export: the shared-catalog + customer-group types).
3. Reset/import from that pack onto a fresh scope and verify the
   differentiation survived the round trip.
4. Every step drives through skills visible in the skills modal.

Step 2 fails today (gap 1). Steps 1 and 3 work now.

## Constraints

- **THE PATH (settled 2026-08-23, third revision — the record of how it
  moved is below): the user deploys the service to Adobe Runtime in his own
  workspace, with his OWN MongoDB.** The shared deployment will not be
  changed — its operator will not be setting variables — so gap 1 is closed
  by ownership, not by waiting. The design conversation with the service's
  author settled the hosting question long ago: Runtime, never embedded in
  the extension ("use the runtime — that way you don't have to manage it").
  The extension stays a pure client; `demoBuilder.dataInstaller.apiBaseUrl`
  points at the user's deployment. Source drop + turnkey guide are local
  (`data-installer-api-b2b/`; config values stay out of this PUBLIC repo).
- **Seeding is self-solving:** the new registry starts empty, but the
  user's instance already holds the full Bodea data — the FIRST export
  (which works, because his deployment has his `MONGO_URI`) captures it
  into his own private pack. Shared packs remain reachable by temporarily
  pointing the setting back at the shared service for an import;
  per-operation service selection is a possible later feature if that
  round trip gets annoying.
- Revision record, so the reasoning is not relitigated: (1) first framed as
  "relay a fix request to the operator" — dead, the operator will not
  change the deployment; (2) then "optional personal stopgap" — wrong
  framing; the user's own deployment IS the design, per the author's own
  hosting advice. What was never on the table: hosting the service inside
  the extension.
- Generated-bundle changes follow `ai-context-authoring` (four gate seams,
  AI_CONTEXT_VERSION bump, regenerate parity).
- Build order (revised after the Postman map): **Route B's tools and skill
  half can be built NOW** — its endpoints (create-datapack, data-item ops,
  batch-get, promote) are proven or documented working on the shared
  deployment. Only Route A's export half waits on the user's own
  deployment; do not ship skill guidance for a step that fails ("worse
  than no skill" — the third-party-tooling item's rule) — mark Route A as
  gated inside the skill until an export succeeds against a configured
  endpoint.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-23-datapack-authoring-loop.md`. First: has the
> export defect (gap 1) been answered? Re-run one export with
> `verbose: 'full'` against a disposable scope and check. If export works,
> settle gap 2 (own-version semantics) with one call, then design the
> orchestration skill per gap 3 using the Bodea acceptance test as the spec.
