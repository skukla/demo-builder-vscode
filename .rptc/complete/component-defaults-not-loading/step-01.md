# Step 1: Investigate and Fix Component Defaults Loading

## Purpose
Verify why component defaults from `templates/defaults.json` are not being applied to the Component Selection Step, and implement a fix.

## Status
- [ ] RED: Manual test confirms defaults not loading
- [ ] GREEN: Fix implemented and verified
- [ ] REFACTOR: Code cleanup (if needed)
- [ ] VERIFICATION: Manual test passes

---

## Test Scenarios

### Manual Test 1: Verify defaults.json content
**Action**: Check that defaults.json has valid content
**Expected**: File exists with component selections defined

### Manual Test 2: Verify backend loads defaults
**Action**: Add debug logging to createProjectWebview.ts getInitialData()
**Expected**: Log shows componentDefaults being loaded and sent

### Manual Test 3: Verify frontend receives defaults
**Action**: Add debug logging to WizardContainer initialization
**Expected**: Log shows componentDefaults in props

### Manual Test 4: Verify ComponentSelectionStep state
**Action**: Add debug logging to ComponentSelectionStep useState initialization
**Expected**: selectedFrontend/selectedBackend have values from defaults

### Manual Test 5: End-to-end verification
**Action**: Open wizard and navigate to Component Selection Step
**Expected**: Components are pre-selected according to defaults.json

---

## Investigation Steps

### 1. Verify defaults.json is loaded (Backend)
- File: `src/commands/createProjectWebview.ts`
- Add console.log or debug logging in getInitialData()
- Verify componentDefaults object structure

### 2. Verify init message contains defaults (Communication)
- File: `src/core/base/baseWebviewCommand.ts`
- Check that initialData includes componentDefaults
- Verify message is sent after handshake

### 3. Verify WebviewApp receives defaults (Frontend Entry)
- File: `webview-ui/src/wizard/index.tsx`
- Check that data.componentDefaults exists in render props
- Add console.log to see actual data structure

### 4. Verify WizardContainer initializes state (State Management)
- File: `webview-ui/src/wizard/components/WizardContainer.tsx`
- Check that componentDefaults prop is received
- Verify state.components is initialized correctly

### 5. Verify ComponentSelectionStep uses defaults (UI Component)
- File: `webview-ui/src/wizard/steps/ComponentSelectionStep.tsx`
- Check that state.components contains expected values
- Verify useState initializers run with correct data

---

## Implementation Plan

### Phase 1: Add Debug Logging (RED)
1. Add debug logs to trace data flow
2. Rebuild extension and webview
3. Launch wizard and collect logs
4. Identify where defaults are lost

### Phase 2: Implement Fix (GREEN)
Based on investigation, likely fixes:
1. **If timing issue**: Ensure ComponentSelectionStep re-initializes when state.components changes
2. **If prop passing issue**: Fix optional chaining or add null checks
3. **If state initialization issue**: Fix WizardContainer state initialization

### Phase 3: Verify Fix (VERIFICATION)
1. Remove debug logging
2. Test wizard flow end-to-end
3. Verify defaults appear in Component Selection Step
4. Test with different default configurations

---

## Files to Modify

### Investigation (Add Debug Logs)
- `src/commands/createProjectWebview.ts` (backend loading)
- `webview-ui/src/wizard/index.tsx` (data passing)
- `webview-ui/src/wizard/components/WizardContainer.tsx` (state init)
- `webview-ui/src/wizard/steps/ComponentSelectionStep.tsx` (UI rendering)

### Implementation (TBD based on investigation)
- To be determined after debug logging reveals root cause

---

## Acceptance Criteria

- [ ] defaults.json is loaded by backend
- [ ] componentDefaults sent in init message
- [ ] WizardContainer receives componentDefaults prop
- [ ] state.components initialized with correct values
- [ ] ComponentSelectionStep displays pre-selected components
- [ ] Manual test: Opening wizard shows defaults applied

---

## Notes

- This is a manual testing scenario (no automated tests)
- Debug logging will be added temporarily for investigation
- Fix will be minimal, focusing on data flow issue
- No quality gates (bug fix only)

---

**Created**: 2025-10-30
**Status**: Ready for execution
