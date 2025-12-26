# Step 10: Standardize Handler Architecture

## Purpose

Fix 5 handler architecture inconsistencies to establish uniform patterns across all features, per SOP consistency-patterns.md Section 15 (Handler Architecture Consistency).

**Inconsistencies Identified:**
1. **Registration patterns**: Dashboard/ProjectsList use `BaseHandlerRegistry`; Mesh/EDS/Prerequisites use direct exports
2. **Organization**: Some have Registry + handlers + helpers; others have individual handler files + shared.ts
3. **Signatures**: All use `HandlerContext` but export styles vary (MessageHandler type vs explicit async)
4. **Helper placement**: `shared.ts` vs `[name]Helpers.ts` vs inline
5. **Error handling**: Inconsistent try/catch patterns and logging approaches

## Prerequisites

- [ ] Step 9 complete (DI patterns standardized)
- [ ] All tests passing

## Tests to Write First (RED Phase)

### Test 1: Registry Pattern Consistency
- **File:** `tests/core/handlers/handlerRegistryConsistency.test.ts`
- [ ] Test: All feature registries extend BaseHandlerRegistry
  - **Given:** Feature handler registries from dashboard, projects-dashboard, project-creation
  - **When:** Checking registry class hierarchy
  - **Then:** All extend BaseHandlerRegistry with registerHandlers() method

### Test 2: Handler Signature Consistency
- **File:** `tests/core/handlers/handlerSignatures.test.ts`
- [ ] Test: All exported handlers match MessageHandler type
  - **Given:** Handler exports from mesh, eds, prerequisites, lifecycle
  - **When:** Checking function signatures
  - **Then:** All match `(context: HandlerContext, payload?: T) => Promise<HandlerResponse>`

### Test 3: Error Response Format
- **File:** `tests/core/handlers/handlerErrorFormat.test.ts`
- [ ] Test: Error responses follow standard format
  - **Given:** Handler that encounters an error
  - **When:** Error is caught and returned
  - **Then:** Returns `{ success: false, error: string, code?: ErrorCode }`

## Files to Create/Modify

### Create: Standard Helper Pattern
- [ ] `src/core/handlers/handlerHelpers.ts` - Base helper utilities (error formatting, auth guards)

### Modify: Features Using Direct Exports (Add Registry Wrapper)
- [ ] `src/features/mesh/handlers/MeshHandlerRegistry.ts` - New registry class
- [ ] `src/features/eds/handlers/EdsHandlerRegistry.ts` - New registry class
- [ ] `src/features/prerequisites/handlers/PrerequisitesHandlerRegistry.ts` - New registry class
- [ ] `src/features/lifecycle/handlers/LifecycleHandlerRegistry.ts` - New registry class

### Standardize: Helper File Naming
- [ ] Rename `src/features/dashboard/handlers/meshStatusHelpers.ts` to `shared.ts` pattern OR
- [ ] Document that `[domain]Helpers.ts` is acceptable for domain-specific helpers

### Standardize: Error Handling Pattern
- [ ] `src/core/handlers/errorHandling.ts` - Standard error wrapper function

## Implementation Details

### GREEN Phase

1. **Create standardized error handler:**
```typescript
// src/core/handlers/errorHandling.ts
export function handleError(
    context: HandlerContext,
    operation: string,
    error: unknown,
): HandlerResponse {
    const err = toError(error);
    context.logger.error(`[${operation}] Failed:`, err);
    return {
        success: false,
        error: err.message,
        code: ErrorCode.UNKNOWN,
    };
}
```

2. **Create registry classes for features using direct exports** (mesh example):
```typescript
// src/features/mesh/handlers/MeshHandlerRegistry.ts
export class MeshHandlerRegistry extends BaseHandlerRegistry {
    protected registerHandlers(): void {
        this.handlers.set('check-api-mesh', handleCheckApiMesh);
        this.handlers.set('create-mesh', handleCreateMesh);
        this.handlers.set('delete-mesh', handleDeleteMesh);
    }
}
```

3. **Document helper placement decision:**
   - `shared.ts` - Cross-handler utilities used by 2+ handlers in feature
   - `[handler]Helpers.ts` - Single-handler complex logic extraction

### REFACTOR Phase

- Ensure all registries follow same constructor pattern
- Standardize handler export from index.ts (registry + individual handlers)
- Update command files to use registry pattern consistently

## Expected Outcome

- [ ] All 5 feature handler directories use BaseHandlerRegistry pattern
- [ ] Helper file naming is consistent (`shared.ts` for cross-cutting, `*Helpers.ts` for domain)
- [ ] Error handling uses standardized wrapper function
- [ ] All handlers exportable both individually and via registry
- [ ] Handler signatures consistently match MessageHandler type

## Acceptance Criteria

- [ ] All handler tests passing
- [ ] No direct handler map instantiation outside registries
- [ ] Error responses follow `{ success, error, code }` format
- [ ] Helper placement documented in consistency-patterns.md
- [ ] Coverage >= 80% for new/modified handler infrastructure

## Estimated Time

2-3 hours

## Dependencies

- BaseHandlerRegistry from `@/core/base`
- HandlerContext, MessageHandler, HandlerResponse from `@/types/handlers`
- ErrorCode from `@/types/errorCodes`

## Risks

- **Risk:** Breaking existing handler registrations during migration
  - **Mitigation:** Create registries alongside existing exports; deprecate direct usage gradually
- **Risk:** Features may have intentional differences in handler patterns
  - **Mitigation:** Document exceptions in SOP if justified
