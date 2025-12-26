# Step 9: Standardize Dependency Injection Patterns

## Purpose

Fix DI inconsistencies identified in codebase audit. Per `consistency-patterns.md` Section 12, handlers should use context-based injection (`context.logger`, `context.stateManager`), not direct instantiation (`new Logger()`). Services use constructor injection or ServiceLocator for singletons.

## Prerequisites

- [ ] Steps 7-8 complete (god file split creates new service layer needing DI)
- [ ] HandlerContext interface unchanged from prior steps

## Tests to Write First

- [ ] **Test: Handler uses context.logger instead of direct instantiation**
  - Given: Handler function with context parameter
  - When: Handler logs a message
  - Then: Uses `context.logger.info()`, NOT `new Logger().info()`
  - File: `tests/features/mesh/handlers/meshHandlers.test.ts`

- [ ] **Test: ServiceLocator provides singleton services**
  - Given: ServiceLocator initialized in extension.ts
  - When: Multiple consumers call getAuthenticationService()
  - Then: Same instance returned (singleton)
  - File: `tests/core/di/serviceLocator.test.ts`

- [ ] **Test: Services receive logger via constructor**
  - Given: Service class with logging needs
  - When: Service instantiated
  - Then: Logger passed via constructor, not created internally
  - File: `tests/features/mesh/services/stalenessDetector.test.ts`

## Files to Modify

- [ ] `src/features/mesh/services/stalenessDetector.ts` - Replace `new Logger()` with constructor injection
- [ ] `src/features/mesh/services/meshVerifier.ts` - Replace `getLogger()` with constructor injection
- [ ] `src/features/mesh/handlers/*.ts` - Ensure handlers use `context.logger`
- [ ] `src/features/eds/services/*.ts` - Audit and standardize to constructor injection

## Implementation Details

### RED Phase
Write tests verifying:
1. Handlers access logger via context, not direct creation
2. Services receive dependencies via constructor
3. ServiceLocator returns consistent singletons

### GREEN Phase
1. **Handlers**: Replace any `getLogger()` or `new Logger()` with `context.logger`
2. **Services**: Add constructor parameters for Logger, remove internal instantiation
3. **ServiceLocator**: Ensure all singleton services registered during activation

### REFACTOR Phase
1. Remove unused `getLogger` imports from handler files
2. Update JSDoc to document injected dependencies
3. Verify no circular dependencies introduced

## Expected Outcome

- All handlers use context-based injection exclusively
- All services use constructor injection for dependencies
- ServiceLocator used only for true singletons (CommandExecutor, AuthenticationService)
- Zero `new Logger()` calls in handler files

## Acceptance Criteria

- [ ] No `new Logger()` in any handler file
- [ ] All modified files pass existing tests
- [ ] ServiceLocator test coverage at 80%+
- [ ] No new ESLint errors

## Estimated Time

2-3 hours
