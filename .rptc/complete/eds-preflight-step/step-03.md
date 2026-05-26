# Step 3: Modify Executor to Skip EDS Resource Creation

## Purpose

Update `executor.ts` to conditionally skip EDS Phase 0 operations (GitHub repo, DA.live, Helix) when EDS preflight already ran in the wizard. Ensure config.json is pushed ONCE after mesh deployment using pre-created resources.

## Prerequisites

- [ ] Step 1 complete (EdsPreflightStep component exists and stores results)
- [ ] Step 2 complete (wizard-steps.json includes eds-preflight step)
- [ ] Understanding of executor.ts Phase 0 (lines 244-401) and Post-Mesh (lines 548-638)

## Implementation Details

### Detecting Preflight Completion

Add `preflightComplete` flag to `edsConfig` interface. When EdsPreflightStep succeeds, it sets:

```typescript
edsConfig: {
  preflightComplete: true,  // NEW: Signals preflight ran successfully
  repoUrl: string,          // From preflight result
  repoName: string,
  githubOwner: string,
  // ... existing fields
}
```

### Skipping Phase 0

Modify EDS Setup block (line 253) condition:

```typescript
// BEFORE
if (isEdsStack && typedConfig.edsConfig) {

// AFTER
if (isEdsStack && typedConfig.edsConfig && !typedConfig.edsConfig.preflightComplete) {
```

When `preflightComplete: true`, skip entire EDS Setup block but still:
1. Register EDS component instance (using `edsConfig.repoUrl`)
2. Store project state for later post-mesh push

### Single config.json Push

Post-Mesh block (line 560) already handles single push. Modify to use `edsConfig` when preflight ran:

```typescript
// Get repoUrl from either edsResult (inline setup) or edsConfig (preflight)
const repoUrl = edsResult?.repoUrl || typedConfig.edsConfig?.repoUrl;
```

This ensures config.json is pushed exactly once with mesh endpoint, regardless of whether EDS ran inline or in preflight.

### Using Pre-created Resources

When preflight completed, executor uses `edsConfig` for:
- `repoUrl` - For config.json GitHub push
- `previewUrl`, `liveUrl` - For component instance metadata
- `daLiveOrg`, `daLiveSite` - For component instance metadata

## Files to Modify

### `src/features/project-creation/handlers/executor.ts`

Key changes:
1. **Line 253**: Add `&& !typedConfig.edsConfig.preflightComplete` condition
2. **Lines 375-393**: Extract component registration to work with either `edsResult` or `edsConfig`
3. **Line 560**: Use `edsConfig.repoUrl` fallback when `edsResult` unavailable

### `src/features/project-creation/handlers/executor.ts` (types)

Update `ProjectCreationConfig.edsConfig` interface:
```typescript
edsConfig?: {
  preflightComplete?: boolean;  // NEW
  repoUrl?: string;             // NEW - from preflight result
  previewUrl?: string;          // NEW - from preflight result
  liveUrl?: string;             // NEW - from preflight result
  // ... existing fields
}
```

## Expected Outcome

- When `edsConfig.preflightComplete: false` (or missing): Executor runs EDS Phase 0 as before
- When `edsConfig.preflightComplete: true`: Executor skips Phase 0, uses preflight results
- Config.json pushed exactly once after mesh deployment in both scenarios
- EDS component instance registered correctly regardless of setup path

## Acceptance Criteria

- [ ] `preflightComplete` flag added to `edsConfig` interface
- [ ] Phase 0 skipped when `preflightComplete: true`
- [ ] Component instance registered using either `edsResult` or `edsConfig`
- [ ] Post-mesh config.json push uses `edsConfig.repoUrl` fallback
- [ ] Existing inline EDS setup continues working when preflight not used
- [ ] No duplicate config.json pushes

## Dependencies from Other Steps

**Requires:**
- Step 1: EdsPreflightStep stores `repoUrl`, `previewUrl`, `liveUrl` in wizard state
- Step 5: WizardContainer passes preflight results to executor via `edsConfig`

**Provides to:**
- Step 4: Cancel handling needs to know preflight state for cleanup decisions
- Step 5: Defines contract for what `edsConfig` fields executor expects
