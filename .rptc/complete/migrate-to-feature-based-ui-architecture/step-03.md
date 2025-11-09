# Step 3: Migrate Dashboard Feature

## Purpose

Migrate the Project Dashboard webview UI from `webview-ui/src/dashboard/` to `src/features/dashboard/ui/`, following the pattern established in Step 2. The Dashboard shows project status, running servers, logs, and provides quick actions for project management.

**What This Step Accomplishes:**
- Dashboard UI components moved to feature-based location
- Import paths updated from `@/webview-ui/*` to `@/features/*` and `@/shared/*`
- Tests migrated to tests/features/dashboard/ui/ directory (mirror structure)
- Dashboard bundle builds successfully from new location
- Extension command references updated

**Criticality:** MEDIUM - Dashboard is frequently used, but failure is isolated to dashboard only.

---

## Prerequisites

**Completed Steps:**
- ✅ Step 1: Webpack + Config Setup
- ✅ Step 2: Migrate Welcome Feature (pattern validated)

**Required Knowledge:**
- Understanding of current Dashboard implementation
- Familiarity with VS Code TreeView integration (if applicable)
- Knowledge of webview message passing for dashboard actions

**Existing Code to Review:**
- `webview-ui/src/dashboard/index.tsx` - Entry point
- `webview-ui/src/dashboard/ProjectDashboardScreen.tsx` - Main component
- `webview-ui/src/dashboard/` - Other subcomponents
- `src/commands/projectDashboardWebview.ts` - Extension command
- `tests/` - Existing dashboard tests

---

## Tests to Write First

### Test Scenario 1: Dashboard Renders Successfully

**Given:** Dashboard entry point at `src/features/dashboard/ui/index.tsx`
**When:** Webpack builds dashboard-bundle.js
**Then:**
- Bundle builds without errors
- Bundle size reduced (vendors extracted)
- No import resolution errors

**Test Type:** Integration test (build verification)
**Coverage Target:** 100% (build must succeed)

### Test Scenario 2: ProjectDashboardScreen Component

**Given:** Dashboard component with project status data
**When:** Component renders with mock project info
**Then:**
- Project name displays
- Server status shows (running/stopped)
- Action buttons render (Start, Stop, Configure)
- Logs section displays

**Test Type:** Unit test
**Coverage Target:** 85%
**Test File:** `src/features/dashboard/ui/ProjectDashboardScreen.test.tsx`

### Test Scenario 3: Dashboard Actions

**Given:** Dashboard with project running
**When:** User clicks "Stop" button
**Then:**
- Message sent to extension host
- Button state updates (loading → stopped)
- Status indicator changes

**Test Type:** Unit test (mock message passing)
**Coverage Target:** 90% (critical functionality)

### Test Scenario 4: Server Status Display

**Given:** Dashboard receives server status update
**When:** Message from extension with status="running"
**Then:**
- Status indicator shows green
- "Start" button disabled
- "Stop" button enabled
- Port information displays

**Test Type:** Unit test
**Coverage Target:** 85%

---

## Edge Cases to Test

**Edge Case 1: Server Start Failure**
- **Scenario:** Server fails to start (port conflict)
- **Expected:** Error message displays, status stays "stopped"
- **Test:** Mock failed start message, verify error handling

**Edge Case 2: Logs Panel Empty**
- **Scenario:** No logs available yet
- **Expected:** "No logs available" message, not blank panel
- **Test:** Render dashboard with no logs

**Edge Case 3: Long Running Operation**
- **Scenario:** Server taking >10 seconds to start
- **Expected:** Loading indicator persists, timeout warning shown
- **Test:** Mock delayed status update

---

## Error Conditions to Test

**Error Condition 1: Invalid Project State**
- **Trigger:** Extension sends malformed project data
- **Expected Behavior:** Error boundary catches, shows fallback UI
- **Test:** Pass invalid data structure

**Error Condition 2: Message Passing Failure**
- **Trigger:** VS Code API unavailable (shouldn't happen, but defensive)
- **Expected Behavior:** Actions disable, error message shown
- **Test:** Mock vscode.postMessage to throw

**Error Condition 3: Concurrent Action Attempts**
- **Trigger:** User clicks "Start" twice rapidly
- **Expected Behavior:** Second click ignored while first pending
- **Test:** Rapid button clicks, verify single message sent

---

## Files to Create/Modify

### Created Files (Migrated from webview-ui/src/dashboard/)

#### 1. `src/features/dashboard/ui/index.tsx` (ENTRY POINT)

**Source:** `webview-ui/src/dashboard/index.tsx`

**Migration Steps:**
1. Copy file to new location
2. Update imports to @/core/ui/*
3. Verify React root mounting
4. Test bundle builds

#### 2. `src/features/dashboard/ui/ProjectDashboardScreen.tsx`

**Source:** `webview-ui/src/dashboard/ProjectDashboardScreen.tsx`

**Import Changes:**
```typescript
// OLD
import { ServerStatus } from '@/components/ServerStatus';
import { LogsPanel } from '@/components/LogsPanel';
import { useVSCodeAPI } from '@/hooks/useVSCodeAPI';

// NEW
import { ServerStatus } from '@/core/ui/components/ServerStatus';
import { LogsPanel } from '@/core/ui/components/LogsPanel';
import { useVSCodeAPI } from '@/core/ui/hooks/useVSCodeAPI';
```

#### 3. Dashboard Subcomponents (if exist)

**Potential files:**
- `ServerStatusCard.tsx` - Server status display
- `ActionButtons.tsx` - Start/Stop/Configure buttons
- `LogsViewer.tsx` - Logs display component
- `ComponentBrowser.tsx` - File browser (if exists)

**Migration:** Copy each file, update imports.

#### 4. `tests/features/dashboard/ui/ProjectDashboardScreen.test.tsx` (MIRRORED TEST)

**Test Coverage:**
- Component renders with project data
- Server status updates correctly
- Action buttons trigger correct messages
- Logs display correctly
- Error states handle gracefully

#### 5. Additional test files for subcomponents in tests/features/dashboard/ui/

### Modified Files

#### 1. `src/commands/projectDashboardWebview.ts`

**Verify bundle path unchanged:**
```typescript
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'dashboard-bundle.js')
);
```

**No changes needed** - bundle output path same, source changed.

#### 2. `src/features/dashboard/CLAUDE.md` (if exists)

**Update documentation:**
- Document new UI location
- Update import examples
- Note feature-based structure

---

## Implementation Guidance

### Migration Order

1. **Create directory:**
   ```bash
   mkdir -p src/features/dashboard/ui
   ```

2. **Copy components:**
   ```bash
   cp webview-ui/src/dashboard/*.tsx src/features/dashboard/ui/
   ```

3. **Update imports in all files** to @/core/ui/*

4. **Compile TypeScript:**
   ```bash
   npx tsc --noEmit
   ```

5. **Build webpack:**
   ```bash
   npm run build
   ```

6. **Write mirrored tests in tests/ directory:**
   ```bash
   # Create test files in tests/features/dashboard/ui/
   npm test -- tests/features/dashboard
   ```

7. **Manual verification:**
   - Launch Extension Development Host (F5)
   - Open project, trigger Dashboard command
   - Test all interactions (Start, Stop, Configure, Logs)

8. **Delete old files:**
   ```bash
   rm -rf webview-ui/src/dashboard/
   ```

9. **Commit:**
   ```bash
   git add src/features/dashboard/
   git rm -r webview-ui/src/dashboard/
   git commit -m "refactor(dashboard): migrate to feature-based UI architecture"
   ```

### Shared Components Check

**Components that may need to move first:**
- `ServerStatus` component
- `LogsPanel` component
- `ActionButton` components

**Strategy:**
- If these are in `webview-ui/src/shared/`, move to `src/core/ui/` first
- Update all imports to reference new location
- Ensure no circular dependencies

---

## Expected Outcome

**After Step 3 Completion:**

✅ **Dashboard Feature Migrated:**
- All Dashboard UI in src/features/dashboard/ui/
- Old webview-ui/src/dashboard/ deleted
- Tests in tests/features/dashboard/ui/ (mirrors source structure)
- Coverage maintained at 80%+

✅ **Build Working:**
- dashboard-bundle.js builds successfully
- Bundle size reduced (vendors extracted)
- No errors or warnings

✅ **Extension Working:**
- Dashboard opens correctly
- Server status displays accurately
- Action buttons work (Start, Stop, Configure)
- Logs display correctly
- All message passing functional

**Next Step:** Step 4 - Migrate Configure Feature (depends on Dashboard utilities)

---

## Acceptance Criteria

**Definition of Done for Step 3:**

- [x] Directory created: `src/features/dashboard/ui/`
- [x] All Dashboard components migrated
- [x] All imports updated to new paths
- [x] Tests created in tests/features/dashboard/ui/ and passing (38 tests)
- [x] Coverage maintained at 85%+ (100% for migrated code)
- [x] Webpack builds dashboard-bundle.js successfully
- [x] Code splitting working (vendors-bundle.js extracted)
- [x] Old directory deleted (webview-ui/src/dashboard/)
- [ ] Extension command works in Dev Host (manual verification needed)
- [ ] All dashboard features functional (Start, Stop, Logs) (manual verification needed)
- [ ] Message passing working correctly (tested via unit tests)
- [ ] Git commit created

**Blocker Conditions:**

- ❌ If server actions don't work, debug message passing
- ❌ If logs don't display, check LogsPanel migration
- ❌ If tests fail, debug mirrored test imports (tests/features/dashboard/ui/)

---

## Dependencies from Other Steps

**Depends On:**
- ✅ Step 1: Webpack + Config Setup
- ✅ Step 2: Welcome migration (pattern validated)

**Enables:**
- Step 4: Configure migration (may share Dashboard utilities)

**Can Run in Parallel With:**
- Step 2: Welcome (independent features)
- Step 4: Configure (if utility dependencies managed)

---

## Notes

**Dashboard Complexity:**
- More complex than Welcome (server state, logs, actions)
- Heavily uses message passing to extension
- Tests require mocking VS Code API

**Message Passing Testing:**
- Mock `vscode.postMessage` in tests
- Verify correct message types sent
- Test state updates after message responses

**Performance Consideration:**
- Logs panel may have performance concerns (large log output)
- Ensure virtualization or pagination working after migration
- Test with large log files

---

_Step 3 establishes Dashboard in feature-based structure. Similar complexity features follow._
