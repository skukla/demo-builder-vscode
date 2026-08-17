# Codebase sweep — 2026-08-17

Run at the `v1.0.0-beta.132` cut. 199 non-merge commits since `beta.131`, roughly
half of them Data Installer, plus the Bodea package unhide.

## Movement since last sweep

| Scan | 2026-08-11 | Now | Verdict |
|---|---|---|---|
| component-extraction | 4 groups | **5 groups** | +1, and the SHAPE is the finding — see #1 |
| code-duplication (jscpd) | 64 clones / 0.70% | **69 clones / 0.68%** | +5 clones, but lines% DOWN — the codebase grew faster than the duplication |
| circular-dependency | 13 | **14** | +1; none of the 14 are in `data-installer` |
| dead-code doc-drift | 0 | **1** | any hit is real — see #3 |

## Findings

### 1. A full-screen surface shell rendered four times

- **Sites**: `page-container-padded`, `page-header-section` and
  `projects-sticky-header` each appear across the SAME four files —
  `features/dashboard/ui/integrationsSurface/IntegrationsScreen.tsx`,
  `features/data-installer/ui/views/DatapackActivityView.tsx`,
  `features/data-installer/ui/views/DatapackCatalogView.tsx`,
  `features/projects-dashboard/ui/ProjectsDashboard.tsx`.
- **Shape**: three classes, one identical quartet. That is the worked example from
  the skill exactly — one shell rendered N times, not one utility reused. It is
  also why the group count moved: Data Installer added two of the four this cycle
  by copying the shape from `IntegrationsScreen`, which its own module docstring
  says out loud ("The page shell is the house one, copied from `IntegrationsScreen`").
- **Proposal**: extract a `FullScreenSurface` (sticky header band + header section +
  padded content) to `core/ui/components/layout/`. The four callers keep their own
  header contents and body; only the band and the width constraint move.
- **Cost**: medium. Four call sites, all in the same shape, plus the CSS-source
  guards that read these class names as text — `pageContentAlignment.test.ts` and
  `integrationsGridLayout.test.ts` parse the stylesheet, so the classes must keep
  their literal names even if the markup is shared.

### 2. Webview command registration duplicated across four commands

- **Sites**: `features/dashboard/commands/showDashboard.ts:507-533`,
  `features/dashboard/commands/showIntegrations.ts:172-183`,
  `features/dashboard/commands/openAi.ts:156-167`,
  `features/projects-dashboard/commands/showProjectsList.ts:201-223`.
- **Shape**: the same 11–26 line block in four commands across TWO features. Rule
  of Three passed some time ago; the cross-feature span is the part that drifts,
  because a fix applied in `dashboard/` never reaches `projects-dashboard/`.
- **Proposal**: one `registerWebviewCommand(...)` helper in `core/`.
- **Cost**: small, but it touches command registration — the thing that fails at
  activation rather than in a test. Worth doing with the extension host open.

### 3. Doc drift: `RecordedChoiceNotice`

- **Site**: `docs/systems/data-installer.md:152` names it; the component was
  deleted 2026-08-17 when the "set up for" banner was replaced by a check on the
  card itself.
- **Verdict**: real, and self-inflicted in this cycle. Baseline was 0 and this is
  the only hit, so the drift hook is working and the doc simply was not updated
  with the code.
- **Proposal**: fix the doc. Cheap, and it ships in this release either way.

### 4. `dashboardHandlers.ts` repeats one block five times (noted, not proposed)

`features/projects-dashboard/handlers/dashboardHandlers.ts` contains five clones,
all of the 671–720 region (13–33 lines each). Same-file clones are usually fine per
the triage rules, and a same-file repeat cannot drift between features — but five
copies of one block in a 968-line handler is a decomposition signal rather than a
duplication one. Left as an observation; `decompose-god-file` is the skill for it
if the file grows further.

## Considered and rejected

### `status-text` (4 files) — legitimate
`StatusCard`, `OrgContextNotice`, `DaLiveServiceCard`, `GitHubServiceCard`. A status
text utility used by four unrelated components, which is a utility doing its job.
No other class co-occurs across that set — the absence of a second shared class is
what separates this from #1.

### `icon-label` (4 files) — legitimate
`ActionGrid`, `DashboardTile`, `AiZone`, `UtilityBar`. Same reasoning: one layout
utility, no co-occurring shell.

### `page-container-padded` alone (8 files) — legitimate on its own
It spans eight files including four outside the quartet, exactly as
`page-container-padded` did at the 2026-08-05 sweep. On its own it is the canonical
960px width band. It only becomes evidence in combination with the other two
classes over the same four files, which is finding #1.

### The 14 cycles — carried, not proposed
None are in `data-installer`, so nothing this cycle introduced them, and the count
moved by one against a baseline whose per-cycle list was not recorded — so WHICH
one is new cannot be established from here. Most remain the known same-feature
handler/phase pairs (`storefrontSetup*` accounts for five). The full list is
carried below so the next sweep can diff rather than re-count.

## Baselines to carry forward

| Scan | Baseline (2026-08-17) |
|---|---|
| component-extraction | 5 groups |
| code-duplication (jscpd) | 69 clones / 0.68% lines |
| circular-dependency | 14 cycles |
| dead-code doc-drift | 0 after fixing #3 |

**Cycle list, so the next sweep can diff instead of counting:**
`appBuilderComponentMigration→projectFileLoader` · `allowedDomain→ensureMeshApiSubscribed`
(×2 shapes) · `ensureMeshApiSubscribed→appBuilderComponentRunnerDeps` ·
`consoleProjectTeardown→…Events` · `ComponentRegistryManager→DependencyResolver` ·
`storefrontSetupHandlers→storefrontSetupPhases` (+ phase1/2/3 variants, 5 total) ·
`configServiceRegistration→…phase3` · `ProjectCreationHandlerRegistry→handlers/index` ·
`AddIntegrationFlowModal→DestinationStage→useProjectCreationPhases→index` ·
`ReviewStep→reviewStepHelpers`
