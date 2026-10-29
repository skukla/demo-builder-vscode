# What one long agent session says about the MCP tooling

Written 2026-09-30, at the owner's request ("review back against all the tool calls you've
made so far to surface areas of improvement, perhaps for the MCP tooling"), while the
AccuformNMC catalog loaded.

**The evidence** is this session's own transcript (`11282aa5…`, 2026-09-17 → 2026-09-30,
616 MB): every Demo Builder tool call went through the live probe, so the calls are Bash
commands of the form `probe.mjs call <tool> '<json>'`. Read two ways, which agree:

- a purpose-built extraction (probe-calls, results, error patterns): **654 calls, 69 distinct
  tools, 84 answered an error** (588 with an inline answer to classify);
- `agent-gap-scan --session 11282aa5` after two fixes to the scan (below): **579 of our calls**,
  32 prose errors, 193 repeat reads, 57 interventions (the owner spoke right after a call).

Numbers are leads, not verdicts (the scan's own rule). Each finding below names the calls.

## The findings, in order of how often they cost something

### 1. Arguments guessed from the tool's name, rejected by its schema (10 calls, 8 tools)

`get_erp_status '{}'` ×2 (needs `id`), `get_project '{}'` ×2 (needs `projectName`),
`get_integration_install_status {componentId}` (it wants `id`), `run_erp_rest {path}` (it wants
`route`), `configure_project {…, confirm:true}` (its strict schema refuses the key every write
tool requires), `set_project_destination {project:"<id>", workspace:"<id>"}` (it wants
`{id,name,title}` objects), `check_github_app {repo}` (owner+repo), `invoke_runtime_action` once.

Each cost one round trip plus a `schema` read. Three shapes of fix, cheapest first:

- **Default the obvious.** `get_project` with no name = the current project. `get_erp_status`
  with no `id` = the project's one ERP integration when there is exactly one (there is a
  `get_current_project` precedent for "the one we mean"). Both are reads; nothing is risked.
- **One name per idea.** `id` on some tools and `componentId` on others for the same thing;
  `path` on the Commerce tools and `route` on the ERP one. Pick one and accept the other as an
  alias for a release.
- **Take an id where a person has one.** `set_project_destination` demands the project's
  `name` and `title`; the agent had the id from `create_adobe_project` seconds earlier. The
  tool could resolve the rest from `list_adobe_projects` itself.

### 2. Tool names guessed and not found (3 calls)

`list_integrations`, `read_commerce_rest`, `list_available_integrations`. The pattern behind
two of them: every other read is `get_*`/`list_*`, and the Commerce GET is `run_commerce_rest`
— a name that says "action". Renaming is churn; the cheaper fix is the description saying
"the read; `write_commerce_rest` is the write" (it does) AND `list_components` saying it is
the integrations catalog too (it does not mention integrations).

### 3. The probe gated a read behind `--force` (6 calls)

`run_commerce_rest` declares `readOnlyHint: true`, and the probe refused it without `--force`
four times, because the probe judged read-only by a NAME regex. That is the exact derivation
the 2026-08-25 audit removed from the server. **Fixed today:** the probe reads the server's
`annotations.readOnlyHint` and falls back to the regex only for a tool without one.
Measured: callable without `--force` went from 66 to **68 of 148**; `republish` is still gated.

### 4. Diagnoses that blamed the wrong thing (fixed today, 4 sites)

- `previewCode` reported every Helix 400 as "mirror not caught up" and never read `x-error`;
  the real reason was "github bot not installed on repository" (`ece349c70`). The creation
  phase said "Code synchronized" over it (same commit). The app check classes that state as
  "installed" — **EDS-23**, open.
- Every Commerce 401/403 was "the workspace credential is not accepted — reinstall the
  integration"; a 403 that meant "AEM Assets Integration disables the gallery API" got that
  advice (`13121afb2`).
- `set_project_destination` kept `organization: ''` and reported success (`74a8fde77`);
  `create_project` never recorded the Commerce endpoint (`d699b6ec4`). Both surfaced as a
  third tool's refusal minutes later, which is the expensive way to learn it.

### 5. Timeouts and transport on the Commerce tools (10 calls)

"the request failed — This operation was aborted" ×5 and HTTP 503 "upstream connect error"
×5, all on `run_commerce_rest`/`write_commerce_rest`, all 09-24/25 against company and credit
endpoints. ACCS writes were measured at 13–25 s each today and >120 s on 09-17. Two asks: say
the timeout in the refusal ("gave up after 30 s") so the agent can decide to wait, and retry a
503 once before answering it.

### 6. One product per call (this afternoon)

43 tags + 96 creates at 13–25 s each = ~35 min of wall clock. The owner: "doesn't bode well
for a quick action for an end user." Logged on **AI-10**: the SC-shaped path is a datapack
through the Data Installer; the bulk REST API (`async/bulk/V1/...`) is unreachable through the
tool (it prefixes `/V1`) and unverified on ACCS. Also: `POST products/{sku}/media` is refused
on this instance ("disabled by AEM Assets Integration"), so a datapack for it carries assets
for AEM, not gallery entries.

### 7. Repeat reads (193 by the scan's count; 40 near-repeats of `run_commerce_rest`)

Most are legitimate — a REST read per entity is how REST works — but three clusters are
tools answering less than the next step needs:

- `list_adobe_projects` re-read 9 times within three events: the answer is a list with no
  "which one is selected", so the next call re-reads it to pick.
- `get_project` ×7 near-repeats: the agent kept coming back for one field (the workspace,
  the endpoint, the list id) that a narrower tool did not expose. `get_erp_status` now carries
  `listId` (`8623e0ebd`) for one of those.
- `list_runtime_activations` → `read_runtime_activation` pairs (38 + 26 calls): debugging
  the ERP integration's event handlers. Rare for an SC; fine as is.

### 8. Things done outside the tools, because no tool did them

- **Helix's reason for a code failure**: `curl` against admin.hlx.page (401 — only the
  extension's DA.live bearer works), then a logging change and a host reload to read it.
  A diagnostics tool that reports the storefront's code/preview/live status WITH `x-error`
  would have answered in one call. `check_github_app` is the natural home once EDS-23 lands.
- **Is the code on the CDN**: 9 `curl -sI …/scripts/scripts.js` checks. `get_project_status`
  reports `edsStorefrontStatus: "stale"` — a summary, not the fact. A `codeLive`/`configLive`
  pair on it would end the curls.
- **The project file**: `python3` over `.demo-builder.json` 6 times, to read `adobe`,
  `componentConfigs`, `appBuilderComponents[*].listId`. `get_project` answers most of it;
  `listId` it did not (now does via `get_erp_status`).
- **GitHub**: `gh api` for fstab/branches/commits and whether the App covers a repo (it
  cannot answer that either — EDS-19 measured the same).

### 9. The measuring instruments themselves (fixed today)

- `agent-gap-scan` could not read this transcript at all (`ERR_STRING_TOO_LONG` at 616 MB) —
  it now streams lines — and it counted 0 of our calls because every one was a probe call
  wearing Bash — it now recognises `probe.mjs call <tool>` as ours. Before the fix its
  verdict on this session was "never called a Demo Builder tool".
- `mcp-live-probe`: the name-regex gate, above.

## What is NOT a finding

`read_runtime_activation`/`invoke_runtime_action` answering `success:false` (11 calls) — those
are real action failures reported correctly, during debugging. `get_erp_record` 500s ×3 were
an integration bug fixed the same week. "Adobe sign-in required" ×3 were true.

## Recommended order

1. Defaults on `get_project` and `get_erp_status`; alias `componentId`/`id` and `route`/`path`
   (finding 1) — small, every agent hits them.
2. `get_project_status` gains `codeLive`/`configLive` (finding 8) and `check_github_app`
   gains the x-error classification (EDS-23).
3. Commerce tool timeouts stated, 503 retried once (finding 5).
4. AI-10: the datapack path for catalog loads (finding 6).
