# Research: EDS Setup Not Executing When Switching Architecture

**Date**: 2025-12-30
**Topic**: Why EDS setup (GitHub repo, DA.live content) doesn't execute when switching architecture from headless to EDS

## Summary

There are **4 critical issues** preventing EDS setup from executing when switching architecture from headless to EDS. The core problem is that `EdsProjectService` (which handles GitHub repo, DA.live, Helix setup) is **never called** from the project creation executor.

## Observed Behavior

When user:
1. Imported a headless project
2. Switched architecture to EDS + PaaS
3. Filled in GitHub repo, DA.live project settings
4. Clicked create

**Expected**: GitHub repo created, DA.live content copied, Helix configured, then mesh deployed

**Actual**: Only commerce-mesh installed. No GitHub/DA.live/Helix setup. Warning logged:
```
[warning] [Project Creation] Component eds not found in registry
```

## Root Causes

| # | Issue | Severity | File:Line |
|---|-------|----------|-----------|
| 1 | `"eds"` not in `selectionGroups.frontends` | CRITICAL | `components.json:581` |
| 2 | `"eds-paas"` not in `selectionGroups.stacks` | CRITICAL | `components.json:583` |
| 3 | `EdsProjectService.setupProject()` never called | CRITICAL | `executor.ts` (missing) |
| 4 | EDS frontend has no `source` property | HIGH | `components.json:13` (by design) |

## Detailed Analysis

### Issue #1: "eds" Not in selectionGroups

**Location**: `src/features/components/config/components.json`

```json
"selectionGroups": {
  "frontends": ["headless"],      // Missing "eds"
  "stacks": ["headless-paas"]     // Missing "eds-paas", "eds-accs"
}
```

**Impact**: `ComponentRegistryManager.getFrontends()` returns only `["headless"]`, so "eds" is never found in the registry. The executor logs a warning and skips the component.

### Issue #2: EdsProjectService Never Called

**Location**: `src/features/project-creation/handlers/executor.ts`

The executor has phases for:
- Phase 1-2: Component download/install
- Phase 3: Mesh deployment
- Phase 4-5: Env files and finalization

**Missing**: No phase calls `EdsProjectService.setupProject()` which handles:
- GitHub repo creation from template
- Helix 5 configuration
- DA.live content copy
- Tool installation

The `EdsProjectService` class exists at `src/features/eds/services/edsProjectService.ts` with a complete `setupProject()` method (lines 114-224), but it is **never instantiated or called** from the project creation flow.

### Issue #3: EDS Frontend Has No Source Property

**Location**: `src/features/components/config/components.json`, lines 13-39

```json
{
  "frontends": {
    "eds": {
      "name": "Edge Delivery Services",
      "description": "EDS storefront with Commerce Drop-in components",
      // NO "source" PROPERTY - by design, comes from demo-packages.json
    }
  }
}
```

EDS is treated as an **abstract component type** in components.json. The actual frontend implementation comes from `demo-packages.json` (which defines storefronts for "eds-paas" and "eds-accs").

Even if Issue #1 were fixed, the executor would fail at line 457-465 because it validates that component definitions have a `source` property.

## Symptom Chain

```
1. User selects "eds-paas" stack
2. Stack defines frontend: "eds"
3. Executor calls loadComponentDefinitions()
4. getFrontends() searches for "eds" in registry
5. Registry only has ["headless"] -> "eds" not found
6. WARNING: "[Project Creation] Component eds not found in registry"
7. Frontend loading skipped (continue statement at line 435)
8. Only commerce-mesh gets installed
9. EdsProjectService never called
10. No GitHub/DA.live/Helix setup happens
```

## Key Files

| File | Purpose |
|------|---------|
| `executor.ts:434` | Logs warning, skips component |
| `ComponentRegistryManager.ts:216-296` | selectionGroups filtering |
| `edsProjectService.ts:114-224` | Full EDS setup (never called) |
| `stacks.json:28-52` | EDS stacks defined correctly with `requiresGitHub: true` |

## What Should Happen

1. User selects EDS stack -> `requiresGitHub` and `requiresDaLive` flags detected
2. Executor detects EDS frontend and calls `EdsProjectService.setupProject()`
3. EDS service orchestrates: GitHub -> Helix -> DA.live -> Tools
4. Then normal mesh deployment continues

## Recommended Fixes

### Option A: Full Integration (Recommended)

1. Add "eds" to `selectionGroups.frontends` in components.json
2. Add "eds-paas", "eds-accs" to `selectionGroups.stacks`
3. Add EDS setup phase to executor.ts that calls `EdsProjectService.setupProject()`
4. Handle EDS frontend source specially (from `frontendSource` param, not component definition)

### Option B: Stack-Based Detection

1. In executor.ts, check if selected stack has `requiresGitHub: true` or `requiresDaLive: true`
2. If so, call `EdsProjectService.setupProject()` before component installation
3. Skip frontend cloning for EDS (handled by EdsProjectService)

## Key Takeaways

1. **EDS project creation is fundamentally broken** - the integration between stack selection and EDS setup service was never completed
2. **The EDS setup code exists** (`EdsProjectService`) but is orphaned - never called from executor
3. **Registry filtering** excludes EDS entirely from selectable components
4. **This is not a minor bug** - it requires significant integration work to connect the EDS setup flow to the project creation executor

## Related Log Output

```
2025-12-30 02:48:25.854 [warning] [Project Creation] Component eds not found in registry
2025-12-30 02:48:25.854 [info] [debug] [Project Creation] Phase 1: Downloading components...
2025-12-30 02:48:25.855 [info] [debug] [Project Creation] Cloning: Adobe Commerce API Mesh
```

Note: Only commerce-mesh was cloned. No EDS frontend, no GitHub setup, no DA.live setup.
