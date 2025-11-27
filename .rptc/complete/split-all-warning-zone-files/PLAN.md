# Split All Warning Zone Test Files (500-750 lines)

## Objective

Split all 33 test files in the warning zone (500-750 lines) to improve memory efficiency and maintainability.

## Strategy

Use proven parallel agent-based splitting technique in 4 batches:
- **Batch 1**: 8 largest files (740-620 lines)
- **Batch 2**: 8 files (627-560 lines)
- **Batch 3**: 8 files (580-524 lines)
- **Batch 4**: 9 files (538-505 lines)

Each batch follows the workflow:
1. Launch 8-9 agents in parallel
2. Validate all tests passing
3. Clean up placeholders/backups
4. Commit changes

## Success Criteria

- ✅ All 33 files split into focused test files
- ✅ 0 files over 500 lines
- ✅ All tests passing (100% pass rate)
- ✅ No placeholder/backup files remaining
- ✅ Memory savings of 40-50% for large test files

---

## Batch 1: Top 8 Largest Files (740-620 lines)

### Target Files

1. **tests/features/project-creation/ui/wizard/WizardContainer.test.tsx** (740 lines)
   - Split by: Wizard lifecycle aspects (initialization, navigation, state management, error handling)

2. **tests/features/authentication/ui/steps/AdobeProjectStep.test.tsx** (727 lines)
   - Split by: Project selection, display, validation, messaging

3. **tests/core/shell/environmentSetup.test.ts** (698 lines)
   - Split by: Setup phases, validation, error scenarios, edge cases

4. **tests/features/prerequisites/handlers/checkHandler.test.ts** (694 lines)
   - Split by: Check operations, status updates, error handling, caching

5. **tests/core/shell/commandExecutor.test.ts** (676 lines)
   - Split by: Command execution, error handling, output parsing, timeout scenarios

6. **tests/features/authentication/ui/steps/AdobeWorkspaceStep.test.tsx** (655 lines)
   - Split by: Workspace selection, display, validation, messaging

7. **tests/features/project-creation/handlers/createHandler.test.ts** (636 lines)
   - Split by: Project creation phases, validation, error handling, completion

8. **tests/features/authentication/services/authenticationService.test.ts** (635 lines)
   - Split by: Authentication operations, token management, session handling, errors

### Expected Outcome

- 8 files → ~24-32 focused test files
- All tests passing
- ~1,800 lines reduction (35-40%)

---

## Batch 2: Next 8 Files (627-560 lines)

### Target Files

9. **tests/features/lifecycle/handlers/lifecycleHandlers.test.ts** (627 lines)
   - Split by: Lifecycle operations (start, stop, restart, status)

10. **tests/features/components/ui/steps/ComponentSelectionStep.test.tsx** (627 lines)
    - Split by: Component selection, dependencies, validation, display

11. **tests/features/authentication/ui/hooks/useSelectionStep.test.tsx** (620 lines)
    - Split by: Hook behaviors (selection, validation, state updates, effects)

12. **tests/features/authentication/handlers/authenticationHandlers-authenticate.test.ts** (613 lines)
    - Split by: Auth flows (new auth, re-auth, errors, edge cases)

13. **tests/unit/utils/progressUnifier.test.ts** (601 lines)
    - Split by: Progress tracking strategies, updates, errors, edge cases

14. **tests/commands/handlers/HandlerRegistry.test.ts** (596 lines)
    - Split by: Registration, execution, error handling, lifecycle

15. **tests/features/updates/services/updateManager.test.ts** (581 lines)
    - Split by: Update checking, downloading, installation, rollback

16. **tests/webview-ui/shared/components/navigation/NavigationPanel.test.tsx** (580 lines)
    - Split by: Navigation, search, filtering, keyboard interactions

### Expected Outcome

- 8 files → ~24-32 focused test files
- ~1,600 lines reduction

---

## Batch 3: Next 8 Files (580-524 lines)

### Target Files

17. **tests/features/prerequisites/handlers/continueHandler.test.ts** (580 lines)
    - Split by: Continue operations, validation, state transitions, errors

18. **tests/features/mesh/ui/steps/ApiMeshStep.test.tsx** (578 lines)
    - Split by: Mesh configuration, deployment, status, errors

19. **tests/webview-ui/shared/hooks/useFocusTrap.test.ts** (573 lines)
    - Split by: Focus management, keyboard handling, edge cases, accessibility

20. **tests/features/authentication/services/authCacheManager.test.ts** (570 lines)
    - Split by: Cache operations (read, write, invalidate, TTL, eviction)

21. **tests/features/authentication/handlers/projectHandlers.test.ts** (561 lines)
    - Split by: Project operations (fetch, select, validate, errors)

22. **tests/features/mesh/services/meshDeploymentVerifier.test.ts** (560 lines)
    - Split by: Verification phases, status checks, errors, edge cases

23. **tests/features/authentication/services/organizationValidator.test.ts** (552 lines)
    - Split by: Validation rules, error scenarios, edge cases

24. **tests/webview-ui/shared/components/navigation/SearchableList.test.tsx** (551 lines)
    - Split by: Search, filtering, rendering, keyboard navigation

### Expected Outcome

- 8 files → ~24-32 focused test files
- ~1,400 lines reduction

---

## Batch 4: Final 9 Files (538-505 lines)

### Target Files

25. **tests/features/prerequisites/services/prerequisitesCacheManager.test.ts** (538 lines)
    - Split by: Cache operations (read, write, invalidate, eviction)

26. **tests/features/prerequisites/ui/steps/PrerequisitesStep-progress.test.tsx** (528 lines)
    - Split by: Progress display, updates, errors, edge cases

27. **tests/types/typeGuards-utility.test.ts** (525 lines)
    - Split by: Type guard categories (validation, transformation, utility)

28. **tests/features/dashboard/ui/configure/ConfigureScreen.test.tsx** (524 lines)
    - Split by: Configuration operations, validation, display, errors

29. **tests/unit/prerequisites/cacheManager.test.ts** (523 lines)
    - Split by: Cache operations (read, write, eviction, TTL)

30. **tests/types/typeGuards-domain.test.ts** (519 lines)
    - Split by: Domain type guards (entities, DTOs, commands)

31. **tests/features/project-creation/helpers/envFileGenerator.test.ts** (519 lines)
    - Split by: Generation, validation, merging, error handling

32. **tests/webview-ui/shared/hooks/useAutoScroll.test.ts** (516 lines)
    - Split by: Scroll behaviors, triggers, edge cases, performance

33. **tests/features/mesh/services/meshDeployment.test.ts** (505 lines)
    - Split by: Deployment phases, configuration, errors, edge cases

### Expected Outcome

- 9 files → ~27-36 focused test files
- ~1,200 lines reduction

---

## Overall Impact

### Before
- 33 files in warning zone (500-750 lines)
- Total: ~19,200 lines
- Memory: High (150-200MB per large file)

### After
- 0 files over 500 lines
- ~99-128 focused test files
- Total reduction: ~6,000 lines (31%)
- Memory savings: 40-50% (60-100MB per file)

### Quality Metrics
- 100% test pass rate maintained
- Improved test isolation and maintainability
- Faster test execution (parallel-friendly)
- Better developer experience (easier to understand and modify)

---

## Cleanup Checklist (Per Batch)

After each batch:
- [ ] Delete original large test files
- [ ] Delete .OLD renamed files
- [ ] Delete .bak backup files
- [ ] Delete placeholder files
- [ ] Verify no orphaned testUtils
- [ ] Run file size validation script
- [ ] Run full test suite
- [ ] Commit changes with descriptive message

---

## Lessons Learned from CI Blocker Work

### What Worked Well ✅
- Parallel agent execution (4 agents successfully)
- Aspect-based splitting strategy
- testUtils pattern for shared mocks
- Immediate validation and cleanup
- Closure semantics awareness in mock helpers

### Pitfalls to Avoid ❌
- Don't return callback variables directly (use closures)
- Don't keep placeholder files
- Don't skip validation between batches
- Don't commit without running tests
- Don't batch multiple logical changes in one commit

### Best Practices 🎯
- Split by functional aspect, not arbitrary line counts
- Extract shared mocks to testUtils files
- Validate closure semantics in mock helpers
- Run tests after each agent completes
- Clean up immediately after validation
- Commit in logical batches

---

## Agent Instructions Template

For each file split:

```
You are a specialized test file splitting agent. Your task is to split a large test file into smaller, focused test files.

FILE TO SPLIT: [file_path]
CURRENT SIZE: [line_count] lines
TARGET: Split into 3-4 focused files under 300 lines each

SPLITTING STRATEGY:
1. Analyze test structure and identify logical aspects
2. Group related tests by functional aspect
3. Extract shared mocks/factories to [name].testUtils.ts
4. Create aspect-based split files: [name]-[aspect].test.ts
5. Ensure all imports and mocks are correct
6. CRITICAL: Verify closure semantics in mock helpers

REQUIREMENTS:
- Each split file must have complete, working tests
- All tests must pass individually and collectively
- Proper TypeScript imports and types
- No duplicate code (use testUtils for shared code)
- Clear, descriptive file names
- Maintain existing test descriptions

VALIDATION:
- Run npm test on each split file
- Verify all tests passing
- Check for proper mock isolation
- Ensure no closure bugs in helpers

DELIVERABLES:
- 3-4 split test files
- 1 testUtils file (if needed)
- Summary of split strategy
- Test pass confirmation
```

---

## Timeline

Each batch is estimated at 15-20 minutes:
- Agent execution: 5-8 minutes (parallel)
- Validation: 3-5 minutes
- Cleanup: 2-3 minutes
- Commit: 1-2 minutes

**Total estimated time: 60-80 minutes for all 33 files**

---

## Risk Mitigation

### Risk 1: Agent failures
**Mitigation**: Process in batches, validate after each, retry failed files individually

### Risk 2: Test failures
**Mitigation**: Immediate validation, restore from git if needed, fix before proceeding

### Risk 3: Closure bugs
**Mitigation**: Explicitly check mock helpers for proper closure semantics, reference AdobeAuthStep fix

### Risk 4: Incomplete cleanup
**Mitigation**: Checklist-based cleanup after each batch, automated file size checks

### Risk 5: Merge conflicts
**Mitigation**: Stay on feature branch, pull latest before each batch, rebase if needed
