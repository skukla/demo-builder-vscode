# Step 2: Project Creation Feature

## Purpose

Refactor logging in the project-creation feature - highest impact area with ~29 `info()` calls with `[Component]` prefix.

## Prerequisites

- Step 1 complete (baseline established)

## Tests to Write First

### Test: Verify Project Creation Tests Still Pass

```bash
npm run test:fast -- tests/features/project-creation/
```

### Test: Grep Verification After Changes

```bash
# After changes, this should return only milestone messages
grep -n "logger\.info.*\[" src/features/project-creation/ --include="*.ts" -r
```

**Expected**: Only milestone messages (✅, "successfully", "complete") remain as `info()`

## Implementation

### Files to Modify

1. **`src/features/project-creation/handlers/executor.ts`** (24 info → ~19 debug)

   **Keep as `info()`** (user milestones):
   - `[Project Creation] ✅ All components downloaded and configured`
   - `[Project Creation] ✅ Mesh configuration updated successfully`
   - `[Project Creation] ✅ Project state saved successfully`
   - `[Project Creation] Completed successfully!`
   - `[Project Creation] ===== PROJECT CREATION WORKFLOW COMPLETE =====`

   **Change to `debug()`** (technical details):
   - `[Project Creation] Stopping running demo on port...`
   - `[Project Creation] Found X existing files/folders, cleaning up...`
   - `[Project Creation] Existing directory cleaned`
   - `[Project Creation] Created directory: ${projectPath}`
   - `[Project Creation] Deferring project state save...`
   - `[Project Creation] Installing component: ${componentDef.name}`
   - `[Project Creation] Successfully installed ${componentDef.name}` (internal step, not final)
   - `[Project Creation] Deploying mesh from ${meshComponent.path}`
   - `[Project Creation] Fetching mesh info via describe...`
   - `[Project Creation] Updated mesh state after successful deployment`
   - `[Project Creation] Populated meshState.envVars with deployed config`
   - `[Project Creation] Updated mesh state for existing mesh`
   - `[Project Creation] API Mesh configured`
   - `[Project Creation] Project manifest created`
   - `[Project Creation] About to save project state...`
   - `[Project Creation] ${componentId} version: ${detectedVersion}`
   - `[Project Creation] Sending completion message to webview...`
   - `[Project Creation] ✅ Completion message sent` → `debug()` (internal step)
   - `[Project Creation] Webview panel closed automatically...`

2. **`src/features/project-creation/handlers/createHandler.ts`** (8 info → ~7 debug)

3. **`src/features/project-creation/commands/createProject.ts`** (1 info)

4. **`src/features/project-creation/helpers/envFileGenerator.ts`** (1 info)

## Categorization Logic

Apply this pattern for each call:
```typescript
// KEEP as info() - user milestone
logger.info('[Project Creation] ✅ All components downloaded and configured');
logger.info('[Project Creation] Completed successfully!');

// CHANGE to debug() - technical detail
logger.debug('[Project Creation] Created directory: ${projectPath}');
logger.debug('[Project Creation] Installing component: ${componentDef.name}');
```

## Expected Outcome

- Project creation feature uses `debug()` for technical flow
- Only user milestones remain as `info()`
- All existing tests pass

## Acceptance Criteria

- [ ] `npm run test:fast -- tests/features/project-creation/` passes
- [ ] Technical flow messages changed to `debug()`
- [ ] Milestone messages preserved as `info()`
- [ ] Grep verification shows only milestones
