# Unenforced seams inventory — 2026-08-21

**Question:** after the payload/config/cast work, which seams — pairs of
artifacts that must agree by convention alone — remain unenforced, and what
should happen to each?

**The base rate that motivated this:** every unenforced seam opened during the
2026-08-20/21 work had drifted (roughly eight for eight: init payloads, hand
schemas, interfaces-vs-JSON, alignment allowlists, fixtures, comments, one
compiler-invisible file). Prediction: any convention-only pair in this repo
has probably already disagreed. This inventory enumerates the remaining pairs
and verdicts each: **ENFORCE** (build a derived check), **SCHEDULE** (owned by
an existing gated item or periodic pass), **ACCEPT** (rule-governed or
cost>value), or **ENFORCED** (already covered — listed so the next audit
doesn't re-derive it).

Every claim below was verified by command during this inventory, not asserted
from memory. One check corrected itself mid-audit (stepLogger keys looked
orphaned until reading the code showed hardcoded defaults + a fallback —
recorded under non-seams).

## Already enforced (don't re-litigate)

| Seam | Mechanism |
|---|---|
| Webview init payloads ↔ screen props | one declaration per channel (`@/types/webviewPayloads`) + `BaseWebviewCommand<TInitialData>` |
| Bundled config ↔ hand schema ↔ TS interface | `tests/templates/config-contracts.test.ts` + `config-interface-contracts.test.ts` (both validate the same real data; auto-discovering, count-pinned) |
| tsc file set ↔ disk | `scripts/check-tsc-blindspots.js` (CI step; both tsconfigs; refuses vacuous pass) |
| Panel sends ↔ registered handlers | `tests/core/communication/webviewHandlerCoverage.test.ts` (derives sends FROM source) |
| MCP descriptors ↔ handler maps | `dataInstallerDescriptors.test.ts` "every row dispatches to a handler that actually exists" |
| Docs naming deleted symbols | dead-code-scan doc-drift section (pre-push + sweep) |
| Boundary casts | codebase-sweep baseline row with per-cluster verdicts |
| Panel handler registration ↔ reused-flow sends | `getRegisteredTypes` loops (registration DERIVED from the map — the pattern that makes this a non-seam) |

## Open seams, ranked by blast radius × drift likelihood

### 1. `.demo-builder.json` manifest ↔ `Project` type — **ENFORCED 2026-08-21** (same day)

Was: `projectFileLoader.ts` parse-CAST the manifest with no validation —
user-machine data from any historical version, trusted by everything. Now:
`manifestValidation.ts` validates every load against a schema GENERATED from
`ProjectManifest` (`scripts/generate-manifest-schema.js`; committed copy
pinned by `manifest-schema-freshness.test.ts` so neither the interface nor
the schema can silently drift). WARN mode by design — unknown fields pass
(manifests cross versions in both directions), a wrong-shaped manifest still
loads best-effort, and the drift lands in Debug Logs (`[Project Load]
manifest shape: …`) instead of surfacing weeks later as a mystery symptom.
`ajv` promoted to a runtime dependency for this.

### 2. Webview message channels (~30) — **SCHEDULE** (already filed)

`.rptc/backlog/2026-08-21-webview-push-channels-are-untyped.md`, gated on
"type a channel when it next causes a bug." One addition recorded here: the
`MessageType` union in `types/messages.ts` ends with `| string` ("allow
custom message types"), which makes the entire union DECORATIVE — a typo'd
message type compiles and then hangs silently. Closing that belongs to the
same item (each typed channel shrinks the custom tail).

### 3. VS Code settings keys ↔ `package.json` declarations — **ENFORCED 2026-08-21**

`tests/templates/manifest-mirrors.test.ts`: both directions, with positive
pins guarding the extraction against vacuous passes. Its FIRST run earned its
keep — it flagged the openInClaude legacy-reset writes to the retired
`ai.surface`/`ai.dockToRight` keys, which turned out to be a live defect: VS
Code rejects `update()` on unregistered keys, so those two lines could only
throw, aborting the reset before the `claudeCode.preferredLocation` cleanup
ever ran (callers swallowed it with a warn). Lines deleted; stale user values
are inert anyway. Original analysis below for the record.

Original: **ENFORCE**

Proven bug class, twice: `demoBuilder.daLive.aemAuthorUrl` (a Feb 2026 rename
orphaned user overrides for six months — memory) and `demoBuilder.ai.surface`
(found during THIS audit: setting retired in `7bbe1bd9` but a config-change
listener for it survived, watching a key that can never change; deleted
2026-08-21). A derived test joining manifest properties against read sites is
cheap but needs the real read-pattern table: section handles
(`getConfiguration('demoBuilder.daLive').get('x')`), const sections
(`SETTINGS_SECTION`), and the `settingsTools.ts` whitelist (the MCP settings
tool reads keys from a table). The naive join produced 3 false positives out
of 5 hits — build the test from the patterns, not the heuristic.

### 4. Cross-config references — **ENFORCED 2026-08-21** (in manifest-mirrors.test.ts: block-library package refs, demo-package addon refs; the previously-existing stacks/demo-packages directions stay in their own suites)

Original: **ENFORCE (extend existing suites)**

Partially covered: stacks→components dependency ids (`stacks.test.ts:167`),
demo-packages→stacks (`demo-packages-data.test.ts:337`). Unverified
directions: demo-packages → block-library ids, addon ids, app-builder
catalog ids. Cheap — each is one more assertion in the suite that already
loads both files.

### 5. Alignment-test field allowlists ↔ interfaces — **CONSOLIDATE**

`type-json-alignment-*.test.ts` hand-copies interface field names into Sets —
and those Sets drifted twice (blessed the dead selectionGroups and the dead
entry fields). The generated-interface contract suite now covers unknown-field
detection for the same files with zero maintenance. Retire the overlapping
assertions; keep only what the generated schemas can't express. Needs care to
keep test counts honest, not urgent.

### 6. Manifest mirrors: commands + bundle names — **ENFORCED 2026-08-21** (same suite: declared commands ⊆ registered; every bundle-name literal ∈ WEBVIEW_ENTRIES, sidebar's hand-rolled filename included)

Original: **ENFORCE (same suite as #3)**

`contributes.commands` ↔ `registerCommand`: clean today in the dangerous
direction (declared-but-unregistered = palette error; currently zero).
22 registered-but-undeclared are legitimate internal commands. Bundle names:
`featureBundleName` literals all match `WEBVIEW_ENTRIES`; the sidebar
hand-rolls `'sidebar-bundle.js'` (`sidebarProvider.ts:575`). Both are one
assertion each inside a single "manifest mirrors" suite alongside #3.

### 7. Instruction-file counts and claims — **SCHEDULE (dream)**

Live instances found today: root `CLAUDE.md` says "~574 suites" and
`.rptc/CLAUDE.md` says "996 suites / 12,764 tests" — reality is 1,125 /
14,847. Instruction staleness is `dream`'s domain (proposes, never applies);
these two are queued evidence for its next run rather than silent edits to
user-owned instruction files.

### 8. Comments describing other modules — **ACCEPT (rule-governed)**

Unscannable mechanically. The CLAUDE.md rule ("a comment describing what
ANOTHER module does is a claim") is the control; this audit added one data
point (the retired-setting docstring claimed a live user affordance).

### 9. Cross-repo duplicates — **ACCEPT, risk recorded**

`pdpUrlEncoding.ts` is deliberately byte-identical in `eds-demo-patches`
(ADR-007); nothing compares them, and this repo's CI can't reach the other
repo. Same for the accs-discovery-service contract and GitHub release asset
naming the updater expects. If a cross-repo drift ever bites, the fix is a
fetch-and-compare test, not a convention.

### 10. AI bundle ↔ `AI_CONTEXT_VERSION` — **ACCEPT (process-governed)**

The `ai-context-authoring` skill + the ADR-013 hash-and-skip writer own this.
Process, not check — but the process has a dedicated skill and an activation
refresh, which is more than most seams get.

## Non-seams found while checking (so the next audit skips them)

- **stepLogger step keys**: unknown keys fall back to a formatted default and
  the logger carries its own hardcoded map — self-healing, not a seam.
- **`logging.json`**: `operations`/`statuses` templates, a different
  mechanism than step keys; no evidence of drift.

## Recommended next actions (in order)

1. File + do the **manifest validation** item (#1) — the one seam whose blast
   radius matches the init-payload work, and the only one needing design.
2. One small **"manifest mirrors" suite** covering #3, #4, #6 — all derived
   checks over files that already exist; roughly a config-contracts-sized job.
3. #5 consolidation whenever the alignment tests next get touched.
4. Everything else rides existing vehicles (untyped-channels item, dream,
   sweep).
