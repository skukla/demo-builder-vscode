# Step 4: Migrate Configure Feature

## Purpose

Migrate the Configure webview UI from `webview-ui/src/configure/` to `src/features/dashboard/ui/configure/`, enabling project configuration management from the feature-based structure. Configure is nested under Dashboard since it's contextually related (accessed from Dashboard).

**What This Step Accomplishes:**
- Configure UI components moved to feature-based location under dashboard
- Import paths updated from `@/webview-ui/*` to `@/features/*` and `@/shared/*`
- Tests migrated to tests/features/dashboard/ui/configure/ directory (mirror structure)
- Configure bundle builds successfully from new location
- Extension command references updated

**Criticality:** MEDIUM - Configure UI is used occasionally but critical for project setup changes.

---

## Prerequisites

**Completed Steps:**
- ✅ Step 1: Webpack + Config Setup
- ✅ Step 3: Migrate Dashboard Feature (Configure may share Dashboard utilities)

**Required Knowledge:**
- Understanding of Configure screen functionality
- Familiarity with .env file management
- Knowledge of Adobe I/O project configuration

**Existing Code to Review:**
- `webview-ui/src/configure/index.tsx` - Entry point
- `webview-ui/src/configure/ConfigureScreen.tsx` - Main component
- `webview-ui/src/configure/` - Configuration form components
- `src/commands/configureProjectWebview.ts` - Extension command

---

## Tests to Write First

### Test Scenario 1: Configure Screen Renders

**Given:** Configure entry point at `src/features/dashboard/ui/configure/index.tsx`
**When:** Webpack builds configure-bundle.js
**Then:**
- Bundle builds without errors
- Bundle size reduced (vendors extracted)
- No import resolution errors

**Test Type:** Integration test (build verification)
**Coverage Target:** 100%

### Test Scenario 2: ConfigureScreen Component

**Given:** Configure component with project configuration
**When:** Component renders with current config
**Then:**
- Configuration fields display current values
- Form validation works
- Save button enabled when changes made
- Cancel button reverts changes

**Test Type:** Unit test
**Coverage Target:** 85%
**Test File:** `src/features/dashboard/ui/configure/ConfigureScreen.test.tsx`

### Test Scenario 3: Configuration Save

**Given:** User modifies configuration field
**When:** User clicks "Save" button
**Then:**
- Validation runs (all fields valid)
- Message sent to extension with new config
- Success notification shown
- Form resets to saved state

**Test Type:** Unit test (mock message passing)
**Coverage Target:** 90%

### Test Scenario 4: Validation Errors

**Given:** User enters invalid configuration
**When:** User attempts to save
**Then:**
- Validation errors display on invalid fields
- Save button disabled
- Error messages clear and actionable

**Test Type:** Unit test
**Coverage Target:** 90%

---

## Edge Cases to Test

**Edge Case 1: Long Configuration Values**
- **Scenario:** API key exceeds 255 characters
- **Expected:** Field truncates with scroll, validation passes if valid format
- **Test:** Enter 500-character value

**Edge Case 2: Special Characters in Paths**
- **Scenario:** Project path contains spaces, unicode
- **Expected:** Path validation accepts, escaping handled correctly
- **Test:** Enter path with spaces/unicode

**Edge Case 3: Concurrent Configuration Changes**
- **Scenario:** User changes config in UI while external .env modification happening
- **Expected:** Conflict detected, user prompted to reload or overwrite
- **Test:** Mock external .env change during edit

---

## Error Conditions to Test

**Error Condition 1: Save Failure**
- **Trigger:** Extension fails to write .env file (permissions, disk full)
- **Expected Behavior:** Error notification shown, form remains editable
- **Test:** Mock save failure response

**Error Condition 2: Load Failure**
- **Trigger:** Cannot read current .env file
- **Expected Behavior:** Warning shown, fields empty with "Unable to load" message
- **Test:** Mock missing .env

**Error Condition 3: Invalid Field Type**
- **Trigger:** Extension sends non-string value for text field
- **Expected Behavior:** Error boundary catches, fallback UI shown
- **Test:** Send malformed config data

---

## Files to Create/Modify

### Created Files (Migrated from webview-ui/src/configure/)

#### 1. `src/features/dashboard/ui/configure/index.tsx` (ENTRY POINT)

**Source:** `webview-ui/src/configure/index.tsx`

**Migration Steps:**
1. Copy file to new location: `src/features/dashboard/ui/configure/`
2. Update imports to @/core/ui/*
3. Verify React root mounting
4. Test bundle builds

**Note:** Configure is nested under `dashboard/ui/configure/` (not top-level `configure/ui/`) because it's contextually related to dashboard functionality.

#### 2. `src/features/dashboard/ui/configure/ConfigureScreen.tsx`

**Source:** `webview-ui/src/configure/ConfigureScreen.tsx`

**Import Changes:**
```typescript
// OLD
import { ConfigField } from '@/components/ConfigField';
import { useProjectConfig } from '@/hooks/useProjectConfig';
import { validateEnvFile } from '@/webview-ui/utils/validation';

// NEW
import { ConfigField } from '@/core/ui/components/ConfigField';
import { useProjectConfig } from '@/core/ui/hooks/useProjectConfig';
import { validateEnvFile } from '@/core/validation'; // or appropriate path
```

#### 3. Configuration Form Components

**Potential files:**
- `ConfigField.tsx` - Individual config field component
- `EnvEditor.tsx` - .env file editor
- `ValidationMessages.tsx` - Validation error display

**Migration:** Copy each, update imports.

#### 4. `tests/features/dashboard/ui/configure/ConfigureScreen.test.tsx` (MIRRORED TEST)

**Test Coverage:**
- Form renders with current config
- Field changes update state
- Validation catches invalid inputs
- Save sends correct message
- Cancel reverts changes

#### 5. Additional test files for subcomponents in tests/features/dashboard/ui/configure/

### Modified Files

#### 1. `src/commands/configureProjectWebview.ts`

**Verify bundle path unchanged:**
```typescript
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'configure-bundle.js')
);
```

**No changes needed** - bundle output path same.

#### 2. `webpack.config.js`

**Verify entry point updated in Step 1:**
```javascript
entry: {
  configure: './src/features/dashboard/ui/configure/index.tsx'
}
```

---

## Implementation Guidance

### Migration Order

1. **Create directory:**
   ```bash
   mkdir -p src/features/dashboard/ui/configure
   ```

2. **Copy components:**
   ```bash
   cp webview-ui/src/configure/*.tsx src/features/dashboard/ui/configure/
   ```

3. **Update imports in all files** to @/core/ui/* (automated + manual verification):
   ```bash
   find src/features/dashboard/ui/configure -name "*.tsx" | \
     xargs sed -i '' 's/@\/webview-ui/@\/core\/ui/g'
   ```

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
   npm test -- tests/features/dashboard/ui/configure
   ```

7. **Manual verification:**
   - Launch Extension Development Host
   - Open project, trigger Configure command
   - Test form editing, validation, save, cancel

8. **Delete old files:**
   ```bash
   rm -rf webview-ui/src/configure/
   ```

9. **Commit:**
   ```bash
   git add src/features/dashboard/ui/configure/
   git rm -r webview-ui/src/configure/
   git commit -m "refactor(configure): migrate to feature-based UI architecture"
   ```

### Shared Utilities to Watch

**Validation Logic:**
- If validation functions in `webview-ui/src/utils/`, move to `src/core/validation/`
- Update imports across Configure and other features

**Form Components:**
- `ConfigField` component should be in `src/core/ui/components/`
- Shared by Configure and potentially wizard steps

---

## Expected Outcome

**After Step 4 Completion:**

✅ **Configure Feature Migrated:**
- All Configure UI in src/features/dashboard/ui/configure/
- Old webview-ui/src/configure/ deleted
- Tests in tests/features/dashboard/ui/configure/ (mirrors source structure)
- Coverage maintained at 80%+

✅ **Build Working:**
- configure-bundle.js builds successfully
- Bundle size reduced (vendors extracted)
- No errors or warnings

✅ **Extension Working:**
- Configure screen opens correctly
- Current config loads and displays
- Form editing works (fields update)
- Validation catches errors
- Save updates .env file
- Cancel reverts changes

**Next Step:** Step 5 - Migrate Authentication Feature (wizard steps, more complex)

---

## Acceptance Criteria

**Definition of Done for Step 4:**

- [x] Directory created: `src/features/dashboard/ui/configure/`
- [x] All Configure components migrated
- [x] All imports updated to new paths
- [x] Mirrored tests created in tests/features/dashboard/ui/configure/ and passing
- [x] Coverage maintained at 80%+ (24 tests passing)
- [x] `npx tsc --noEmit` passes
- [x] `npm run build` generates configure-bundle.js (22 KiB)
- [ ] Extension command works in Dev Host (manual verification needed)
- [ ] Form loads current config correctly (manual verification needed)
- [ ] Field validation works (unit tests passing)
- [ ] Save updates .env successfully (unit tests passing)
- [ ] Cancel reverts changes (unit tests passing)
- [x] Old directory deleted
- [ ] Git commit created

**Blocker Conditions:**

- ❌ If validation breaks, debug validation utility imports
- ❌ If save fails, check message passing to extension
- ❌ If form doesn't load config, debug data flow

---

## Dependencies from Other Steps

**Depends On:**
- ✅ Step 1: Webpack + Config Setup
- ✅ Step 3: Dashboard migration (may share utilities)

**Enables:**
- Step 7: Project Creation Wizard (if wizard references Configure)

**Can Run in Parallel With:**
- Step 2: Welcome (independent)
- Step 5: Authentication (independent unless shared forms)

---

## Notes

**Nested Under Dashboard:**
- Configure is nested under `dashboard/ui/configure/` (not top-level)
- Rationale: Configure is accessed from Dashboard, contextually related
- Keeps Dashboard-related UI together

**Form Validation Testing:**
- Mock form submission in tests
- Test each validation rule independently
- Test combined validation (multiple fields invalid)

**Env File Management:**
- Tests should not touch real .env files
- Mock file read/write in tests
- Use temporary test .env files for integration tests if needed

---

_Step 4 completes standalone webview migrations. Next: wizard steps (more complex, shared patterns)._
