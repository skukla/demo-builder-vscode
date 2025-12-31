# Step 3: Handler Registry Simplification

## Purpose

Replace 7 class-based handler registries with simple object literal maps. The current pattern has a `BaseHandlerRegistry` abstract class with 7 concrete implementations that each just map strings to functions - there is no actual polymorphism benefit. This is a textbook case of over-engineering: using inheritance and classes for what should be simple data structures.

**Problem Being Solved:**
- `BaseHandlerRegistry` abstract class (55 lines) provides 4 methods that just wrap a `Map`
- Each concrete registry class (29-120 lines each) exists solely to call `this.handlers.set()` in a loop
- No registry overrides any behavior - pure boilerplate
- Total: ~520 lines of ceremony for what should be ~100 lines of object literals

**Pattern Transformation:**

```typescript
// BEFORE: 120 lines per registry
class ProjectCreationHandlerRegistry extends BaseHandlerRegistry {
  protected registerHandlers(): void {
    this.handlers.set('ready', lifecycle.handleReady as MessageHandler);
    this.handlers.set('cancel', lifecycle.handleCancel as MessageHandler);
    // ... 40+ more lines
  }
}

// AFTER: 20 lines per registry
export const projectCreationHandlers = {
  'ready': lifecycle.handleReady,
  'cancel': lifecycle.handleCancel,
  // ... direct object literal
} as const satisfies HandlerMap;
```

## Prerequisites

- [ ] Step 1 (State Audit) complete - baseline metrics established
- [ ] Step 2 (Dead Code Removal) complete - unused handler registries identified

## Files to Analyze

| File | Lines | Handlers | Status |
|------|-------|----------|--------|
| `src/core/base/BaseHandlerRegistry.ts` | 55 | N/A (base) | DELETE after migration |
| `src/core/handlers/HandlerRegistry.ts` | 68 | N/A (generic) | KEEP (different pattern) |
| `src/features/project-creation/handlers/ProjectCreationHandlerRegistry.ts` | 120 | 40 | CONVERT |
| `src/features/dashboard/handlers/DashboardHandlerRegistry.ts` | 49 | 16 | CONVERT |
| `src/features/mesh/handlers/MeshHandlerRegistry.ts` | 29 | 3 | CONVERT |
| `src/features/prerequisites/handlers/PrerequisitesHandlerRegistry.ts` | 29 | 3 | CONVERT |
| `src/features/lifecycle/handlers/LifecycleHandlerRegistry.ts` | 54 | 11 | CONVERT |
| `src/features/eds/handlers/EdsHandlerRegistry.ts` | 58 | 15 | CONVERT |
| `src/features/projects-dashboard/handlers/ProjectsListHandlerRegistry.ts` | 58 | 16 | CONVERT |

**Current Total:** ~520 lines
**Target Total:** ~120 lines (77% reduction)

## Tests to Write First

### Test Suite 1: Handler Map Type Safety

- [ ] Test: Handler map type validates at compile time
  - **Given:** A handler map with correct function signatures
  - **When:** TypeScript compiles the file
  - **Then:** No type errors
  - **File:** `tests/core/handlers/handlerMapTypes.test.ts`

- [ ] Test: Handler map rejects invalid handlers
  - **Given:** A handler with incorrect signature (wrong param count, wrong return type)
  - **When:** Added to handler map
  - **Then:** TypeScript compile error (verified via type tests)
  - **File:** `tests/core/handlers/handlerMapTypes.test.ts`

### Test Suite 2: Handler Dispatch Utility

- [ ] Test: dispatchHandler executes matching handler
  - **Given:** A handler map with 'test-action' handler
  - **When:** dispatchHandler called with 'test-action'
  - **Then:** Handler is called with context and data
  - **File:** `tests/core/handlers/dispatchHandler.test.ts`

- [ ] Test: dispatchHandler throws for unknown message type
  - **Given:** A handler map without 'unknown-action'
  - **When:** dispatchHandler called with 'unknown-action'
  - **Then:** Error thrown with descriptive message
  - **File:** `tests/core/handlers/dispatchHandler.test.ts`

- [ ] Test: dispatchHandler awaits async handlers
  - **Given:** An async handler that resolves after delay
  - **When:** dispatchHandler called
  - **Then:** Returns resolved value (not Promise object)
  - **File:** `tests/core/handlers/dispatchHandler.test.ts`

### Test Suite 3: Feature Handler Maps (One per Feature)

- [ ] Test: Project creation handlers include all required message types
  - **Given:** projectCreationHandlers object
  - **When:** Checking for required message types
  - **Then:** All 40 handlers present (ready, cancel, check-auth, etc.)
  - **File:** `tests/features/project-creation/handlers/projectCreationHandlers.test.ts`

- [ ] Test: Dashboard handlers include all required message types
  - **Given:** dashboardHandlers object
  - **When:** Checking for required message types
  - **Then:** All 16 handlers present (ready, requestStatus, startDemo, etc.)
  - **File:** `tests/features/dashboard/handlers/dashboardHandlers.test.ts` (update existing)

- [ ] Test: Mesh handlers include all required message types
  - **Given:** meshHandlers object
  - **When:** Checking for required message types
  - **Then:** All 3 handlers present (check-api-mesh, create-api-mesh, delete-api-mesh)
  - **File:** `tests/features/mesh/handlers/meshHandlers.test.ts`

- [ ] Test: Prerequisites handlers include all required message types
  - **Given:** prerequisitesHandlers object
  - **When:** Checking for required message types
  - **Then:** All 3 handlers present
  - **File:** `tests/features/prerequisites/handlers/prerequisitesHandlers.test.ts`

- [ ] Test: Lifecycle handlers include all required message types
  - **Given:** lifecycleHandlers object
  - **When:** Checking for required message types
  - **Then:** All 11 handlers present
  - **File:** `tests/features/lifecycle/handlers/lifecycleHandlers.test.ts`

- [ ] Test: EDS handlers include all required message types
  - **Given:** edsHandlers object
  - **When:** Checking for required message types
  - **Then:** All 15 handlers present
  - **File:** `tests/features/eds/handlers/edsHandlers.test.ts`

- [ ] Test: Projects list handlers include all required message types
  - **Given:** projectsListHandlers object
  - **When:** Checking for required message types
  - **Then:** All 16 handlers present
  - **File:** `tests/features/projects-dashboard/handlers/projectsListHandlers.test.ts`

### Test Suite 4: needsProgressCallback Preservation

- [ ] Test: needsProgressCallback returns true for create-api-mesh
  - **Given:** needsProgressCallback utility function
  - **When:** Called with 'create-api-mesh'
  - **Then:** Returns true
  - **File:** `tests/features/project-creation/handlers/progressCallbackConfig.test.ts`

- [ ] Test: needsProgressCallback returns false for other types
  - **Given:** needsProgressCallback utility function
  - **When:** Called with 'check-auth' or any other type
  - **Then:** Returns false
  - **File:** `tests/features/project-creation/handlers/progressCallbackConfig.test.ts`

### Test Suite 5: Command Integration

- [ ] Test: CreateProjectWebviewCommand dispatches to handler map
  - **Given:** CreateProjectWebviewCommand with new handler map pattern
  - **When:** Message received from webview
  - **Then:** Correct handler invoked via dispatchHandler
  - **File:** `tests/features/project-creation/commands/createProject.integration.test.ts`

- [ ] Test: ProjectDashboardWebviewCommand dispatches to handler map
  - **Given:** ProjectDashboardWebviewCommand with new handler map pattern
  - **When:** Message received from webview
  - **Then:** Correct handler invoked via dispatchHandler
  - **File:** `tests/features/dashboard/commands/showDashboard.integration.test.ts`

## Implementation Details

### Phase 1: Create Handler Infrastructure (RED -> GREEN)

**Files to Create:**

#### 1. Type Definitions (`src/types/handlers.ts` - update existing)

```typescript
// Add these types to existing handlers.ts

/**
 * Handler map type - simple object literal mapping message types to handlers
 */
export type HandlerMap = Record<string, MessageHandler>;

/**
 * Helper function to create typed handler maps
 * Provides compile-time validation without runtime overhead
 */
export function defineHandlers<T extends HandlerMap>(handlers: T): T {
  return handlers;
}
```

#### 2. Dispatch Utility (`src/core/handlers/dispatchHandler.ts`)

```typescript
import type { HandlerContext, HandlerMap, MessageHandler } from '@/types/handlers';

/**
 * Dispatch a message to the appropriate handler
 *
 * Replaces BaseHandlerRegistry.handle() with a simple function.
 * Preserves the same behavior: lookup, error on missing, async execution.
 */
export async function dispatchHandler(
  handlers: HandlerMap,
  context: HandlerContext,
  messageType: string,
  data: unknown
): Promise<unknown> {
  const handler = handlers[messageType];

  if (!handler) {
    throw new Error(`No handler registered for message type: ${messageType}`);
  }

  return await handler(context, data);
}

/**
 * Check if a handler exists for a message type
 */
export function hasHandler(handlers: HandlerMap, messageType: string): boolean {
  return messageType in handlers;
}

/**
 * Get all registered message types
 */
export function getRegisteredTypes(handlers: HandlerMap): string[] {
  return Object.keys(handlers);
}
```

### Phase 2: Migrate Registries One at a Time

**Migration Order** (smallest to largest, reducing risk):

1. **MeshHandlerRegistry** (29 lines, 3 handlers) - Simplest, lowest risk
2. **PrerequisitesHandlerRegistry** (29 lines, 3 handlers) - Same size
3. **LifecycleHandlerRegistry** (54 lines, 11 handlers) - Medium
4. **DashboardHandlerRegistry** (49 lines, 16 handlers) - Medium
5. **EdsHandlerRegistry** (58 lines, 15 handlers) - Medium
6. **ProjectsListHandlerRegistry** (58 lines, 16 handlers) - Medium
7. **ProjectCreationHandlerRegistry** (120 lines, 40 handlers) - Largest, has needsProgressCallback

#### Example Migration: MeshHandlerRegistry

**Before** (`src/features/mesh/handlers/MeshHandlerRegistry.ts`):
```typescript
import { MessageHandler } from '@/commands/handlers/HandlerContext';
import { BaseHandlerRegistry } from '@/core/base';
import { handleCheckApiMesh } from './checkHandler';
import { handleCreateApiMesh } from './createHandler';
import { handleDeleteApiMesh } from './deleteHandler';

export class MeshHandlerRegistry extends BaseHandlerRegistry {
  protected registerHandlers(): void {
    this.handlers.set('check-api-mesh', handleCheckApiMesh as MessageHandler);
    this.handlers.set('create-api-mesh', handleCreateApiMesh as MessageHandler);
    this.handlers.set('delete-api-mesh', handleDeleteApiMesh as MessageHandler);
  }
}
```

**After** (`src/features/mesh/handlers/meshHandlers.ts` - update existing or rename):
```typescript
import { defineHandlers } from '@/types/handlers';
import { handleCheckApiMesh } from './checkHandler';
import { handleCreateApiMesh } from './createHandler';
import { handleDeleteApiMesh } from './deleteHandler';

/**
 * Mesh feature handler map
 * Maps message types to handler functions for API Mesh operations
 */
export const meshHandlers = defineHandlers({
  'check-api-mesh': handleCheckApiMesh,
  'create-api-mesh': handleCreateApiMesh,
  'delete-api-mesh': handleDeleteApiMesh,
});
```

### Phase 3: Update Command Consumers

**Pattern Change in Commands:**

**Before:**
```typescript
export class ProjectDashboardWebviewCommand extends BaseWebviewCommand {
  private handlerRegistry: DashboardHandlerRegistry;

  constructor(...) {
    this.handlerRegistry = new DashboardHandlerRegistry();
  }

  protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
    const messageTypes = this.handlerRegistry.getRegisteredTypes();
    for (const messageType of messageTypes) {
      comm.onStreaming(messageType, async (data: unknown) => {
        const context = this.createHandlerContext();
        return await this.handlerRegistry.handle(context, messageType, data);
      });
    }
  }
}
```

**After:**
```typescript
import { dashboardHandlers } from '@/features/dashboard/handlers';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';

export class ProjectDashboardWebviewCommand extends BaseWebviewCommand {
  protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
    const messageTypes = getRegisteredTypes(dashboardHandlers);
    for (const messageType of messageTypes) {
      comm.onStreaming(messageType, async (data: unknown) => {
        const context = this.createHandlerContext();
        return await dispatchHandler(dashboardHandlers, context, messageType, data);
      });
    }
  }
}
```

### Phase 4: Handle needsProgressCallback

The `ProjectCreationHandlerRegistry` has a special method `needsProgressCallback()`. Convert to configuration:

**Create** (`src/features/project-creation/handlers/progressCallbackConfig.ts`):
```typescript
/**
 * Message types that require progress callback support
 *
 * These handlers send incremental progress updates to the UI
 * during long-running operations.
 */
const PROGRESS_CALLBACK_TYPES = new Set(['create-api-mesh']);

export function needsProgressCallback(messageType: string): boolean {
  return PROGRESS_CALLBACK_TYPES.has(messageType);
}
```

### Phase 5: Delete Base Class

After all registries migrated:

1. Delete `src/core/base/BaseHandlerRegistry.ts`
2. Update `src/core/base/index.ts` to remove export
3. Verify no remaining imports

### Phase 6: Update/Delete Tests

**Tests to Update:**
- `tests/features/dashboard/handlers/DashboardHandlerRegistry.test.ts` - Update to test object literal
- `tests/features/project-creation/handlers/ProjectCreationHandlerRegistry.test.ts` - Update to test object literal

**Tests to Delete:**
- Any tests that verify `extends BaseHandlerRegistry` pattern
- Tests that verify `new XxxHandlerRegistry()` instantiation

## Files to Create/Modify

### Create:
- [ ] `src/core/handlers/dispatchHandler.ts` - Dispatch utility (30 lines)
- [ ] `src/features/project-creation/handlers/progressCallbackConfig.ts` - Progress config (10 lines)
- [ ] `tests/core/handlers/dispatchHandler.test.ts` - Dispatch tests
- [ ] `tests/core/handlers/handlerMapTypes.test.ts` - Type tests

### Modify:
- [ ] `src/types/handlers.ts` - Add HandlerMap type
- [ ] `src/features/mesh/handlers/index.ts` - Export meshHandlers object
- [ ] `src/features/prerequisites/handlers/index.ts` - Export prerequisitesHandlers object
- [ ] `src/features/lifecycle/handlers/index.ts` - Export lifecycleHandlers object
- [ ] `src/features/dashboard/handlers/index.ts` - Export dashboardHandlers object
- [ ] `src/features/eds/handlers/index.ts` - Export edsHandlers object
- [ ] `src/features/projects-dashboard/handlers/index.ts` - Export projectsListHandlers object
- [ ] `src/features/project-creation/handlers/index.ts` - Export projectCreationHandlers object
- [ ] `src/features/dashboard/commands/showDashboard.ts` - Use new dispatch pattern
- [ ] `src/features/project-creation/commands/createProject.ts` - Use new dispatch pattern
- [ ] `src/features/projects-dashboard/commands/showProjectsList.ts` - Use new dispatch pattern
- [ ] `src/core/base/index.ts` - Remove BaseHandlerRegistry export

### Delete:
- [ ] `src/core/base/BaseHandlerRegistry.ts` - Base class no longer needed
- [ ] `src/features/mesh/handlers/MeshHandlerRegistry.ts` - Converted to object literal
- [ ] `src/features/prerequisites/handlers/PrerequisitesHandlerRegistry.ts` - Converted
- [ ] `src/features/lifecycle/handlers/LifecycleHandlerRegistry.ts` - Converted
- [ ] `src/features/dashboard/handlers/DashboardHandlerRegistry.ts` - Converted
- [ ] `src/features/eds/handlers/EdsHandlerRegistry.ts` - Converted
- [ ] `src/features/projects-dashboard/handlers/ProjectsListHandlerRegistry.ts` - Converted
- [ ] `src/features/project-creation/handlers/ProjectCreationHandlerRegistry.ts` - Converted

## Expected Outcome

**Lines of Code Reduction:**
- Before: ~520 lines (base class + 7 registries)
- After: ~120 lines (7 object literals + dispatch utility)
- **Reduction: ~400 lines (77%)**

**Complexity Reduction:**
- Eliminated: 1 abstract class, 7 concrete classes, inheritance hierarchy
- Replaced with: 7 plain objects, 1 utility function

**What Works After This Step:**
- All message handling continues to function identically
- Type safety maintained via `HandlerMap` type
- Easier to understand: "It's just an object mapping strings to functions"
- needsProgressCallback behavior preserved

## Acceptance Criteria

- [ ] All 7 handler registries converted to object literals
- [ ] `BaseHandlerRegistry` deleted
- [ ] All existing tests pass (updated to new pattern)
- [ ] New tests verify handler map behavior
- [ ] Commands correctly dispatch via `dispatchHandler`
- [ ] `needsProgressCallback` functionality preserved
- [ ] No runtime behavior changes (identical message handling)
- [ ] TypeScript compilation succeeds
- [ ] ~400 lines of code removed

## Estimated Time

**4-6 hours**

- Phase 1 (Infrastructure): 1 hour
- Phase 2 (7 migrations): 2-3 hours (20-30 min each)
- Phase 3 (Command updates): 1 hour
- Phase 4-6 (Cleanup/tests): 1 hour

## Risks

### Risk 1: Missing Handler During Migration
- **Likelihood:** Low
- **Impact:** High (runtime errors)
- **Mitigation:**
  - Migrate one registry at a time
  - Run tests after each migration
  - Compare handler counts before/after

### Risk 2: Type Casting Issues
- **Likelihood:** Medium
- **Impact:** Low (compile-time caught)
- **Mitigation:**
  - Use `defineHandlers()` helper for type inference
  - Review any `as MessageHandler` casts

### Risk 3: needsProgressCallback Regression
- **Likelihood:** Low
- **Impact:** Medium (mesh deployment UX degraded)
- **Mitigation:**
  - Explicit test for this function
  - Keep as separate configuration file

## SOP References

- **architecture-patterns.md**: Premature abstract base classes (this is textbook example)
- **testing-guide.md**: TDD approach - write tests before converting each registry

---

**Status:** Ready for TDD Implementation
