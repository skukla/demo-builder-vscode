# Step 3: Add UI Buttons

## Purpose

Add Publish and Reset action buttons to the EDS project dashboard ActionGrid component and corresponding handler callbacks to the useDashboardActions hook. This connects the UI to the backend handlers created in Steps 1 and 2.

## Prerequisites

- [ ] Step 1 completed (handlePublishEds handler registered)
- [ ] Step 2 completed (handleResetEds handler with confirmation registered)
- [ ] Existing ActionGrid EDS conditional pattern understood
- [ ] Existing useDashboardActions postMessage pattern understood

## Tests to Write First (RED Phase)

### Test File: `tests/features/dashboard/ui/components/ActionGrid.test.tsx`

**Note**: Add tests to existing file in new `describe('EDS-Specific Buttons')` section.

### Test 1: Publish button renders for EDS projects
- **Description**: Verify Publish button appears when isEds=true
- **Given**: ActionGrid rendered with isEds=true
- **When**: Component mounts
- **Then**: Button with text "Publish" is in the document

### Test 2: Reset button renders for EDS projects
- **Description**: Verify Reset button appears when isEds=true
- **Given**: ActionGrid rendered with isEds=true
- **When**: Component mounts
- **Then**: Button with text "Reset" is in the document

### Test 3: EDS buttons hidden for non-EDS projects
- **Description**: Verify Publish/Reset buttons do not appear for non-EDS projects
- **Given**: ActionGrid rendered with isEds=false (default)
- **When**: Component mounts
- **Then**: No "Publish" or "Reset" buttons in document

### Test 4: Publish button disabled during loading
- **Description**: Verify Publish button respects isOpeningBrowser disabled state
- **Given**: ActionGrid rendered with isEds=true, isOpeningBrowser=true
- **When**: Component mounts
- **Then**: Publish button is disabled

### Test 5: Reset button disabled during loading
- **Description**: Verify Reset button respects isOpeningBrowser disabled state
- **Given**: ActionGrid rendered with isEds=true, isOpeningBrowser=true
- **When**: Component mounts
- **Then**: Reset button is disabled

### Test 6: Publish click calls handler
- **Description**: Verify handlePublishEds called on button click
- **Given**: ActionGrid rendered with isEds=true and mock handlePublishEds
- **When**: User clicks Publish button
- **Then**: handlePublishEds mock is called

### Test 7: Reset click calls handler
- **Description**: Verify handleResetEds called on button click
- **Given**: ActionGrid rendered with isEds=true and mock handleResetEds
- **When**: User clicks Reset button
- **Then**: handleResetEds mock is called

---

### Test File: `tests/features/dashboard/ui/hooks/useDashboardActions.test.ts`

**Note**: Add tests to existing test file in new `describe('EDS Actions')` section.

### Test 8: handlePublishEds sends correct message
- **Description**: Verify postMessage called with 'publishEds'
- **Given**: useDashboardActions hook rendered
- **When**: handlePublishEds is called
- **Then**: webviewClient.postMessage called with 'publishEds'

### Test 9: handleResetEds sends correct message
- **Description**: Verify postMessage called with 'resetEds'
- **Given**: useDashboardActions hook rendered
- **When**: handleResetEds is called
- **Then**: webviewClient.postMessage called with 'resetEds'

### Test 10: New handlers returned by hook
- **Description**: Verify handlePublishEds and handleResetEds exist in return value
- **Given**: useDashboardActions hook rendered
- **When**: Hook result accessed
- **Then**: Both handlePublishEds and handleResetEds are defined functions

## Files to Modify

### `src/features/dashboard/ui/components/ActionGrid.tsx`
- Import `PublishCheck` and `Revert` icons from @spectrum-icons/workflow
- Add `handlePublishEds?: () => void` to ActionGridProps interface
- Add `handleResetEds?: () => void` to ActionGridProps interface
- Add Publish and Reset buttons inside existing EDS conditional block

### `src/features/dashboard/ui/hooks/useDashboardActions.ts`
- Add `handlePublishEds: () => void` to UseDashboardActionsReturn interface
- Add `handleResetEds: () => void` to UseDashboardActionsReturn interface
- Add handlePublishEds useCallback implementation
- Add handleResetEds useCallback implementation
- Add both to return object

## Implementation Details (GREEN Phase)

### ActionGrid.tsx Changes

**Add imports:**
```tsx
import PublishCheck from '@spectrum-icons/workflow/PublishCheck';
import Revert from '@spectrum-icons/workflow/Revert';
```

**Add to ActionGridProps interface:**
```tsx
/** Handler for Publish EDS content (EDS only) */
handlePublishEds?: () => void;
/** Handler for Reset EDS project (EDS only) */
handleResetEds?: () => void;
```

**Add to function parameters:**
```tsx
handlePublishEds,
handleResetEds,
```

**Add buttons in EDS section (after existing DA.live button):**
```tsx
{/* Publish - EDS projects (force refresh CDN) */}
{isEds && (
    <ActionButton
        onPress={handlePublishEds}
        isQuiet
        isDisabled={isOpeningBrowser}
        UNSAFE_className="dashboard-action-button"
    >
        <PublishCheck size="L" />
        <Text UNSAFE_className="icon-label">Publish</Text>
    </ActionButton>
)}

{/* Reset - EDS projects (recreate from template) */}
{isEds && (
    <ActionButton
        onPress={handleResetEds}
        isQuiet
        isDisabled={isOpeningBrowser}
        UNSAFE_className="dashboard-action-button"
    >
        <Revert size="L" />
        <Text UNSAFE_className="icon-label">Reset</Text>
    </ActionButton>
)}
```

### useDashboardActions.ts Changes

**Add to UseDashboardActionsReturn interface:**
```typescript
/** Publish EDS content (force refresh CDN) */
handlePublishEds: () => void;
/** Reset EDS project (recreate from template) */
handleResetEds: () => void;
```

**Add handler implementations:**
```typescript
const handlePublishEds = useCallback(() => {
    webviewClient.postMessage('publishEds');
}, []);

const handleResetEds = useCallback(() => {
    webviewClient.postMessage('resetEds');
}, []);
```

**Add to return object:**
```typescript
return {
    // ... existing handlers
    handlePublishEds,
    handleResetEds,
};
```

## Refactor Phase

- [ ] Verify button order is logical (Open in Browser, Author in DA.live, Publish, Reset)
- [ ] Ensure icon choices avoid confusion (Revert vs Refresh for Deploy Mesh)
- [ ] Confirm consistent disabled state pattern with other EDS buttons

## Expected Outcome

- [x] Publish button visible on EDS project dashboard
- [x] Reset button visible on EDS project dashboard
- [x] Buttons hidden for non-EDS projects
- [x] Buttons disabled during loading state (isOpeningBrowser)
- [x] Click handlers send correct message types to backend
- [x] All 10 tests pass

## Acceptance Criteria

- [ ] ActionGrid component tests verify button rendering
- [ ] Hook tests verify postMessage calls
- [ ] No integration tests added (per PM constraint)
- [ ] Buttons follow existing EDS button styling pattern
- [ ] TypeScript interfaces updated for new props/returns
