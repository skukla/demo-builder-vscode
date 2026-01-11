# Step 6: Migrate EDS_COMPONENT_ID

## Purpose
Remove the duplicate `EDS_COMPONENT_ID` constant from `eds/services/types.ts` and update its single consumer to use `COMPONENT_IDS.EDS_STOREFRONT`.

## Prerequisites
- [ ] Steps 1-5 completed (COMPONENT_IDS.EDS_STOREFRONT exists in src/core/constants.ts)

## Tests to Write First
- [ ] Test: executor.ts uses COMPONENT_IDS.EDS_STOREFRONT for EDS component path
  - **Given:** EDS stack project creation
  - **When:** Building component path
  - **Then:** Uses `COMPONENT_IDS.EDS_STOREFRONT` value ('eds-storefront')
  - **File:** `tests/features/project-creation/handlers/executor-edsComponentId.test.ts`

## Files to Modify
- [ ] `src/features/project-creation/handlers/executor.ts`
  - Note: COMPONENT_IDS import already exists from Step 4
  - Remove `EDS_COMPONENT_ID` from eds/services/types import
  - Replace 8 occurrences of `EDS_COMPONENT_ID` with `COMPONENT_IDS.EDS_STOREFRONT`
- [ ] `src/features/eds/services/types.ts`
  - Remove lines 249-250 (comment and constant definition)

## Acceptance Criteria
- [ ] No `EDS_COMPONENT_ID` exports in codebase
- [ ] executor.ts imports from @/core/constants
- [ ] All tests passing
- [ ] TypeScript compiles without errors

## Estimated Time
15 minutes
