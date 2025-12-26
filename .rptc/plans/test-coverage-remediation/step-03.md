# Step 3: Verify Feature Test Mock Alignment

## Purpose
Audit feature test mocks to ensure they match actual JSON structures, focusing on ComponentRegistryManager mocks and identifying v2.0 structural assumptions still present in test code.

## Prerequisites
- [ ] Step 2 complete (components.json type alignment tests in place)
- [ ] Understand mockRawRegistry (v2.0) vs mockRawRegistryV3 (v3.0.0) difference

## Tests to Write First (RED Phase)

### Test: Mock structure validation
- [ ] Test mockRawRegistryV3 contains all v3.0.0 sections (brands, stacks, addons, tools, integrations)
- [ ] Test all field names in mock match type definitions from RawComponentRegistry
- [ ] File: `tests/features/components/services/ComponentRegistryManager-mockValidation.test.ts`

### Audit Checklist (Manual verification)
- [ ] ComponentRegistryManager.testUtils.ts verified for v3.0.0 completeness
- [ ] `createMaliciousRegistry` function updated (currently uses v2.0 `components` map)
- [ ] Grep for other `mockRaw*` patterns across test files
- [ ] Verify no tests hardcode v2.0 `components` map assumptions

## Files to Modify
| Action | File | Description |
|--------|------|-------------|
| Update | tests/features/components/services/ComponentRegistryManager.testUtils.ts | Add missing v3.0.0 sections to mockRawRegistryV3: brands, stacks, integrations, addons, tools |
| Update | tests/features/components/services/ComponentRegistryManager.testUtils.ts | Fix createMaliciousRegistry to use v3.0.0 structure |
| Search | tests/**/*.testUtils.ts (50+ files) | Audit for v2.0 structural assumptions |

## Implementation Details (GREEN Phase)

1. **Review mockRawRegistryV3 against actual components.json**
   - Missing sections: `brands`, `stacks`, `integrations`, `addons`, `tools`
   - Add minimal representative entries for each missing section

2. **Fix createMaliciousRegistry function**
   - Currently references `mockRawRegistry.components!` (v2.0 structure)
   - Update to use section-based access for v3.0.0

3. **Grep for mock patterns across test files**
   ```bash
   # Patterns to search:
   - mockRaw*
   - .components! (v2.0 accessor pattern)
   - selectionGroups.integrations (v3.0.0 added)
   ```

4. **Document any misaligned mocks found**
   - Create list of files needing updates
   - Prioritize by test criticality

## Expected Outcome
- [ ] mockRawRegistryV3 includes all v3.0.0 sections
- [ ] createMaliciousRegistry updated for v3.0.0 structure
- [ ] All feature mocks verified against actual data structures
- [ ] Any drift documented with remediation items

## Acceptance Criteria
- [ ] mockRawRegistryV3 matches components.json v3.0.0 section structure
- [ ] No v2.0-only `components` map assumptions in active test code
- [ ] Audit findings documented in step output
- [ ] Security test utilities (createMaliciousRegistry) work with v3.0.0

## Estimated Time
1-2 hours
