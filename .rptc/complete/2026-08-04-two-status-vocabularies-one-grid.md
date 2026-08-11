# One status vocabulary, three tables

**Filed:** 2026-08-04 · **Updated:** 2026-08-04 — the WORDING half shipped; this item is now
purely structural.
**Origin:** Parallel-implementation audit (the same sweep that produced the three divergences
fixed in `12f82063`).
**Severity:** Medium — three encodings of one fact, agreeing by coincidence.
**Present in:** `integrationCardModel.ts`, `core/ui/utils/meshStatusDisplay.ts`.

## Done: the wording

Mesh labels are now bare state names matching `INTEGRATION_STATUS_DISPLAY` word for word
("Deployed", "Update available", "Deploy failed", "Incomplete", "Not deployed"), and the
projects-list card composes `Mesh · <state>` at its own call site — the division of labour
`getAppStatusText` already used for integrations. The "Not deployed"/"Not Deployed"
capitalisation split is gone. Decision recorded in the table's docblock.

## Remaining: three tables for one fact

| Table | Where | Maps | Consumer |
|---|---|---|---|
| `MESH_STATUS_DISPLAY` | `core/ui/utils/meshStatusDisplay.ts` | 6 mesh statuses → `text` + `color` + `variant` | projects-list card, dashboard header |
| `INTEGRATION_STATUS_DISPLAY` | `integrationCardModel.ts:133` | 5 integration statuses → `label` + `dot` | integration cards |
| `MESH_MATRIX` | `integrationCardModel.ts:352` | 7 card statuses → `dot` | the mesh card |

The mesh table predates the integrations grid. When the mesh became a peer card *in* that grid,
`deriveMeshCard` took its **label** from the old mesh table (via the passed-in `statusDisplay`)
and its **dot** from a new `MESH_MATRIX`. They agree only by coincidence: `config-incomplete` is
`variant: 'warning'` in one and collapses through `toMeshCardStatus` to `stale` → `dot: 'warning'`
in the other. Nothing enforces it.

The apparent justification — three UI components want three prop shapes — is thin. `variant`
(`success|warning|error|neutral`) and `dot` (`+info`) are near-identical, and `color`
(`green|yellow|orange|red|gray`) is a parallel encoding of the same severity. That is one
severity with three renderings, which wants ONE table and three thin adapters, not three tables.

## Execution plan

1. **One table, keyed by the card vocabulary** (`CardStatus` — the widest of the three, 7
   entries), supplying label + severity. Delete `MESH_MATRIX`; let `deriveIntegrationCard` and
   `deriveMeshCard` both read it.
2. **Thin adapters for the render shapes** — severity → `color`, severity → `variant`,
   severity → `dot`. Three one-line maps beat three status tables.
3. **Contract test:** every status yields a label and a severity from the same source. Today a
   new status could get a dot with no matching label, or two that disagree.

## Constraints

- **Copy-preserving.** The wording is settled; this pass must not move a single string.
- The live `statusDisplay.text` must keep winning for the TRANSIENT states (checking,
  needs-auth, deploying) — that is where "Deploying Mesh"/"Adding Mesh" come from, and they
  were an explicit product call.
- Re-verify the file's two agreement claims (`:9`, `:300`) against the code before "fixing"
  them. A first read suggests they are accurate about the deploying case and the earlier audit
  note overstated it.

## Kickoff prompt

> One status fact is encoded in three tables (`MESH_STATUS_DISPLAY`, `INTEGRATION_STATUS_DISPLAY`,
> `MESH_MATRIX`), and the mesh card takes its LABEL from one and its DOT from another — agreeing
> only by coincidence. Collapse to one table keyed by `CardStatus` plus thin severity→prop
> adapters, add a contract test that every status yields a matching label and severity, and keep
> the copy byte-identical (the wording was settled 2026-08-04). See
> `.rptc/backlog/2026-08-04-two-status-vocabularies-one-grid.md`.
