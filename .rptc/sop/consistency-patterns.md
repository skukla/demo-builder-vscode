# Consistency Patterns - Project-Specific SOP

**Version**: 2.0.0
**Last Updated**: 2025-12-17
**Priority**: Project-specific (overrides plugin default)

---

## Purpose

This SOP detects **inconsistent implementation patterns** across the codebase. While `code-patterns.md` catches individual code smells, this SOP ensures the same operation is implemented the same way everywhere.

**Philosophy**: When doing the same thing in multiple places, do it the same way. Inconsistency creates cognitive load, bugs, and maintenance burden.

---

# Part A: Code-Level Consistency

These patterns ensure consistent implementation of common coding operations.

---

## 1. Webview Communication Patterns

**REQUIREMENT**: Use consistent patterns for webview ↔ extension communication.

### Pattern: Fire-and-Forget vs Request-Response

| Use Case | Pattern | Method |
|----------|---------|--------|
| Need response/completion | Request-Response | `webviewClient.request()` |
| No response needed | Fire-and-Forget | `webviewClient.postMessage()` |

### Detection

```typescript
// ❌ INCONSISTENT: Using postMessage when response needed
await webviewClient.postMessage('startDemo', { projectPath });
fetchProjects(true); // Races with command execution!

// ✅ CONSISTENT: Using request when response needed
await webviewClient.request('startDemo', { projectPath });
fetchProjects(true); // Waits for command to complete
```

### Scan Pattern

```bash
# Find postMessage calls followed by state updates (potential race)
grep -B2 -A2 "postMessage\(" src/features/**/ui/*.tsx | grep -A2 "fetch\|set[A-Z]"
```

### Violations to Check

- [ ] `postMessage` used when caller needs to wait for completion
- [ ] `request` used for truly fire-and-forget operations (wasteful)
- [ ] Inconsistent patterns within same feature module

---

## 2. Handler Response Patterns

**REQUIREMENT**: All handlers return responses in consistent format.

### Standard Response Format

```typescript
// Success with data
{ success: true, data: { ... } }

// Success without data
{ success: true }

// Failure
{ success: false, error: 'Human-readable error message' }

// Cancellation (user cancelled, not an error)
{ success: true, data: { success: false, error: 'cancelled' } }
```

### Detection

```typescript
// ❌ INCONSISTENT: Returning raw data without wrapper
export const handleGetUser = async (context) => {
    const user = await context.stateManager.getUser();
    return user; // Wrong! Missing { success, data } wrapper
};

// ❌ INCONSISTENT: Throwing instead of returning error
export const handleGetUser = async (context) => {
    const user = await context.stateManager.getUser();
    if (!user) throw new Error('User not found'); // Wrong! Should return error
    return { success: true, data: user };
};

// ✅ CONSISTENT: Standard wrapper format
export const handleGetUser = async (context) => {
    const user = await context.stateManager.getUser();
    if (!user) return { success: false, error: 'User not found' };
    return { success: true, data: user };
};
```

### Scan Pattern

```bash
# Find handlers not returning success property
grep -l "MessageHandler" src/features/**/handlers/*.ts | xargs grep -L "success:"

# Find handlers throwing instead of returning errors
grep -B5 "throw new Error" src/features/**/handlers/*.ts
```

### Violations to Check

- [ ] Handler returns raw data without `{ success, data }` wrapper
- [ ] Handler throws errors instead of returning `{ success: false, error }`
- [ ] Inconsistent error message formatting across handlers

---

## 3. Shared Logic Extraction Patterns

**REQUIREMENT**: When same logic appears in 2+ handlers, extract to shared helper.

### The Pattern

```typescript
// ❌ INCONSISTENT: Same logic duplicated in multiple handlers
// In handleStartDemo:
const project = await context.stateManager.loadProjectFromPath(path);
if (!project) return { success: false, error: 'Project not found' };
await context.stateManager.saveProject(project);
await vscode.commands.executeCommand('demoBuilder.startDemo');

// In handleStopDemo:
const project = await context.stateManager.loadProjectFromPath(path);
if (!project) return { success: false, error: 'Project not found' };
await context.stateManager.saveProject(project);
await vscode.commands.executeCommand('demoBuilder.stopDemo');

// ✅ CONSISTENT: Extracted to shared helper
// In core/handlers/projectCommandHelper.ts:
export async function executeCommandForProject(
    context: HandlerContext,
    projectPath: string | undefined,
    commandId: string,
): Promise<HandlerResponse> { ... }

// In handlers:
return executeCommandForProject(context, payload?.projectPath, 'demoBuilder.startDemo');
```

### Scan Pattern

```bash
# Find duplicate multi-line patterns in handlers
jscpd src/features/**/handlers --min-lines 5 --reporters console
```

### Violations to Check

- [ ] Same 5+ line pattern appears in 2+ handlers
- [ ] Different handlers doing same operation differently
- [ ] Helper exists but some handlers don't use it

---

## 4. Props Threading Patterns

**REQUIREMENT**: When adding props to component hierarchies, thread consistently.

### The Pattern

```typescript
// ❌ INCONSISTENT: Props threaded to some children but not others
// Parent passes isRunning to Grid but not RowList
<ProjectsGrid isRunning={isRunning} ... />
<ProjectRowList ... /> // Missing isRunning!

// ✅ CONSISTENT: Props threaded to all applicable children
<ProjectsGrid runningProjectPath={runningProjectPath} ... />
<ProjectRowList runningProjectPath={runningProjectPath} ... />
```

### Scan Pattern

```bash
# Find components accepting a prop that their siblings don't
# Manual review: Compare props interfaces of sibling components
grep -A20 "interface.*Props" src/features/**/ui/components/*.tsx
```

### Violations to Check

- [ ] New prop added to one variant (Grid) but not another (RowList)
- [ ] Callback added to one component but missing from sibling
- [ ] Optional prop in parent but required in child (or vice versa)

---

## 5. State Persistence Timing Patterns

**REQUIREMENT**: Use consistent delays for state persistence operations.

### The Pattern

```typescript
// ❌ INCONSISTENT: Magic number delays
await new Promise(resolve => setTimeout(resolve, 500));
await new Promise(resolve => setTimeout(resolve, 1000));
await new Promise(resolve => setTimeout(resolve, 300));

// ✅ CONSISTENT: Named constants with documented purpose
// In extension host:
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
await new Promise(resolve => setTimeout(resolve, TIMEOUTS.PROJECT_STATE_PERSIST_DELAY));

// In webview (can't import TIMEOUTS):
// Local constant with cross-reference comment
const PROJECT_STATE_PERSIST_DELAY = 500; // Matches TIMEOUTS.PROJECT_STATE_PERSIST_DELAY
```

### Scan Pattern

```bash
# Find setTimeout with magic numbers
grep -rn "setTimeout.*[0-9]\+)" src/features/**/ui/*.tsx
grep -rn "Promise.*setTimeout.*[0-9]" src/features/**/ui/*.tsx
```

### Violations to Check

- [ ] Same delay purpose uses different values in different files
- [ ] Delay constants not defined in TIMEOUTS
- [ ] Webview delays without cross-reference comment

---

## 6. Error Handling Patterns

**REQUIREMENT**: Handle errors consistently across similar operations.

### The Pattern

```typescript
// ❌ INCONSISTENT: Different error handling in similar handlers
// Handler A:
} catch (error) {
    console.error('Failed:', error);
    return { success: false, error: 'Operation failed' };
}

// Handler B:
} catch (error) {
    context.logger.error('Failed', error instanceof Error ? error : undefined);
    throw error; // Different! Throws instead of returns
}

// ✅ CONSISTENT: Same pattern across all handlers
} catch (error) {
    context.logger.error('Failed to [operation]', error instanceof Error ? error : undefined);
    return { success: false, error: 'Failed to [operation]' };
}
```

### Scan Pattern

```bash
# Find catch blocks with different patterns
grep -A3 "} catch" src/features/**/handlers/*.ts | grep -E "(throw|console\.|logger\.)"
```

### Violations to Check

- [ ] Some handlers throw, others return errors
- [ ] Some use `console.error`, others use `context.logger.error`
- [ ] Error messages have inconsistent formatting

---

## 7. Import Path Patterns

**REQUIREMENT**: Use consistent import aliases and paths.

### The Pattern

```typescript
// ❌ INCONSISTENT: Mixed relative and alias imports
import { Logger } from '../../../core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { Project } from '../../types/base';

// ✅ CONSISTENT: Always use aliases for cross-feature imports
import { Logger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { Project } from '@/types/base';

// ✅ OK: Relative imports within same feature
import { helper } from './shared'; // Same directory
import { Component } from '../components/MyComponent'; // Within feature
```

### Scan Pattern

```bash
# Find relative imports crossing feature boundaries
grep -rn "from '\.\./\.\./\.\." src/features/
```

### Violations to Check

- [ ] Relative imports crossing 3+ directory levels
- [ ] Mixing `@/` aliases with deep relative paths in same file
- [ ] Inconsistent alias usage across feature modules

---

## 8. Naming Convention Patterns

**REQUIREMENT**: Use consistent naming for similar concepts.

### Handler Naming

| Pattern | Meaning | Example |
|---------|---------|---------|
| `handle[Action]` | Message handler | `handleStartDemo`, `handleGetProjects` |
| `on[Event]` | Event callback | `onSelect`, `onClick` |
| `[verb][Noun]` | Action function | `executeCommand`, `loadProject` |

### Component Prop Naming

| Pattern | Meaning | Example |
|---------|---------|---------|
| `on[Action]` | Callback prop | `onSelect`, `onDelete` |
| `is[State]` | Boolean state | `isRunning`, `isLoading` |
| `has[Thing]` | Boolean existence | `hasError`, `hasMesh` |
| `[noun]` | Data prop | `project`, `items` |

### Scan Pattern

```bash
# Find inconsistent handler naming
grep -rn "export const [a-z]" src/features/**/handlers/*.ts | grep -v "handle"

# Find inconsistent callback prop naming
grep -rn "?: (.*) =>" src/features/**/ui/components/*.tsx | grep -v "on[A-Z]"
```

### Violations to Check

- [ ] Handler not prefixed with `handle`
- [ ] Callback prop not prefixed with `on`
- [ ] Boolean prop not prefixed with `is`/`has`

---

## 9. Feature Module Structure Patterns

**REQUIREMENT**: All features follow consistent directory structure.

### Standard Structure

```
src/features/[feature-name]/
├── commands/           # VS Code commands (if any)
├── handlers/           # Message handlers
│   ├── index.ts       # Barrel exports + dispatchHandler re-export
│   └── [domain]Handlers.ts  # Object literal handler maps
├── services/          # Business logic (if complex)
├── ui/                # React components (if webview)
│   ├── index.tsx      # Entry point
│   ├── [Feature].tsx  # Main component
│   └── components/    # Sub-components
├── utils/             # Feature-specific utilities
└── index.ts           # Public API exports
```

### Scan Pattern

```bash
# Find features missing standard directories
for dir in src/features/*/; do
    [ ! -d "${dir}handlers" ] && echo "Missing handlers: $dir"
    [ -d "${dir}ui" ] && [ ! -f "${dir}ui/index.tsx" ] && echo "Missing ui/index.tsx: $dir"
done
```

### Violations to Check

- [ ] Feature has handlers in non-standard location
- [ ] UI components not in `ui/` subdirectory
- [ ] Missing `index.ts` public API file

---

## 10. Test Organization Patterns

**REQUIREMENT**: Test files mirror source file structure.

### The Pattern

```
src/features/dashboard/handlers/dashboardHandlers.ts
→ tests/features/dashboard/handlers/dashboardHandlers.test.ts

src/features/dashboard/ui/components/ProjectCard.tsx
→ tests/features/dashboard/ui/components/ProjectCard.test.tsx
```

### Scan Pattern

```bash
# Find source files without corresponding test files
for src in src/features/**/*.ts; do
    test="tests/${src#src/}"
    test="${test%.ts}.test.ts"
    [ ! -f "$test" ] && echo "Missing test: $test"
done
```

### Violations to Check

- [ ] Test file in different structure than source
- [ ] Test file name doesn't match source file name
- [ ] Test utilities not in `testUtils.ts` file

---

# Part B: Architectural Consistency

These patterns ensure consistent use of architectural patterns and design decisions across features.

---

## 11. Service Layer Pattern Consistency

**REQUIREMENT**: Use consistent service layer architecture across all features.

### The Pattern

```
Feature with service layer:          Feature without (inconsistent):
├── handlers/                        ├── handlers/
│   └── dashboardHandlers.ts         │   └── meshHandlers.ts  ← 200+ lines of business logic!
├── services/                        └── index.ts
│   ├── projectService.ts
│   └── statusService.ts
└── index.ts
```

### Detection

```typescript
// ❌ INCONSISTENT: Business logic in handlers (>50 lines)
export const handleDeployMesh = async (context, payload) => {
    // 100+ lines of mesh deployment logic
    // validation, API calls, state updates, error handling...
};

// ✅ CONSISTENT: Handlers delegate to services
export const handleDeployMesh = async (context, payload) => {
    const meshService = new MeshDeploymentService(context);
    return meshService.deploy(payload);
};
```

### Scan Pattern

```bash
# Find features with/without services directory
for dir in src/features/*/; do
    if [ -d "${dir}services" ]; then
        echo "HAS services: $dir"
    else
        echo "MISSING services: $dir"
    fi
done

# Find large handler files (likely missing service layer)
find src/features/*/handlers -name "*.ts" -exec wc -l {} \; | awk '$1 > 200 {print}'
```

### Violations to Check

- [ ] Some features have `services/`, others don't
- [ ] Handlers contain >50 lines of business logic
- [ ] Business logic duplicated across handlers (should be in service)
- [ ] Services in inconsistent locations (`utils/` vs `services/`)

---

## 12. Dependency Injection Consistency

**REQUIREMENT**: Use consistent dependency injection patterns across similar code.

### The Pattern

```typescript
// ❌ INCONSISTENT: Direct instantiation in some places
class MeshHandler {
    private logger = new Logger('MeshHandler');  // Direct instantiation
    private api = new AdobeAPI();                // Hard dependency
}

// ✅ CONSISTENT: Constructor injection
class MeshHandler {
    constructor(
        private logger: Logger,
        private api: AdobeAPI,
    ) {}
}

// ✅ CONSISTENT: Context-based injection (this project's pattern)
export const handleMeshDeploy = async (context: HandlerContext) => {
    context.logger.info('Deploying...');         // Injected via context
    await context.stateManager.saveProject();    // Injected via context
};
```

### Detection

```typescript
// ❌ INCONSISTENT: Mixed patterns in same codebase
// File A uses context:
const handleA = (context) => { context.logger.info(...); };

// File B instantiates directly:
const handleB = () => {
    const logger = new Logger('B');  // Wrong! Should use context
    logger.info(...);
};
```

### Scan Pattern

```bash
# Find direct instantiation of services/managers
grep -rn "new [A-Z][a-z]*Service\|new [A-Z][a-z]*Manager" src/features/

# Find mixed logger patterns
grep -rn "new Logger\|getLogger()" src/features/*/handlers/
```

### Violations to Check

- [ ] Some code uses `context.logger`, others use `new Logger()`
- [ ] Some classes receive deps via constructor, others instantiate directly
- [ ] Factory functions (`createX()`) mixed with direct `new X()`
- [ ] Singletons accessed inconsistently (import vs context)

---

## 13. Composition vs Inheritance Consistency

**REQUIREMENT**: Use composition over inheritance consistently.

### The Pattern

```typescript
// ❌ INCONSISTENT: Inheritance in some places
class DeleteProjectCommand extends BaseWebviewCommand {
    // Inherits panel management, communication, etc.
}

// vs Composition in others:
class ExportCommand {
    private communication = new WebviewCommunication();  // Composition
    private panelManager = new PanelManager();           // Composition
}

// ✅ CONSISTENT: Pick ONE approach for similar abstractions
// This project uses: Inheritance for VS Code commands (BaseWebviewCommand)
//                    Composition for services and utilities
```

### React Component Patterns

```typescript
// ❌ INCONSISTENT: Mixed patterns
// Some components use HOCs:
export default withAuth(withTheme(MyComponent));

// Others use hooks:
function MyComponent() {
    const auth = useAuth();
    const theme = useTheme();
}

// ✅ CONSISTENT: This project uses hooks (composition)
function MyComponent() {
    const { isAuthenticated } = useAuth();
    const { theme } = useTheme();
}
```

### Scan Pattern

```bash
# Find class inheritance patterns
grep -rn "class.*extends" src/features/ --include="*.ts" --include="*.tsx"

# Find HOC patterns (should be rare/none)
grep -rn "withAuth\|withTheme\|withRouter" src/features/
```

### Violations to Check

- [ ] Some features use HOCs, others use hooks
- [ ] Abstract base classes where utility functions would suffice
- [ ] Inconsistent inheritance depth across similar classes
- [ ] Mixed composition and inheritance for same concern

---

## 14. Module Boundary/Facade Consistency

**REQUIREMENT**: Use consistent module boundaries and facade patterns.

### The Pattern

```typescript
// ❌ INCONSISTENT: Some features expose internals
// Direct import of internal module:
import { meshValidator } from '@/features/mesh/services/validators/meshValidator';

// ✅ CONSISTENT: Import from feature's public API
import { validateMesh } from '@/features/mesh';  // index.ts exports facade
```

### Index.ts Patterns

```typescript
// ❌ INCONSISTENT: Some features export everything
// mesh/index.ts
export * from './handlers';
export * from './services';
export * from './utils';
export * from './types';  // Exposes ALL internals

// ✅ CONSISTENT: Curated public API
// mesh/index.ts
export { MeshService } from './services/meshService';
export { handleMeshDeploy, handleMeshVerify } from './handlers';
export type { MeshConfig, MeshStatus } from './types';
// Internal helpers NOT exported
```

### Scan Pattern

```bash
# Find imports that bypass index.ts
grep -rn "from '@/features/[^']*/" src/ | grep -v "from '@/features/[^/]*'"

# Check index.ts files for export patterns
for idx in src/features/*/index.ts; do
    echo "=== $idx ==="
    grep "export" "$idx" | head -10
done
```

### Violations to Check

- [ ] Imports bypass feature's index.ts (reach into internals)
- [ ] Some features have clean public API, others export everything
- [ ] Internal utilities exported when they shouldn't be
- [ ] Missing index.ts in some features

---

## 15. Handler Architecture Consistency

**REQUIREMENT**: Use consistent handler organization and patterns across features.

### Organization Patterns

```
Pattern A: Single file                 Pattern B: Split by domain
├── handlers/                          ├── handlers/
│   └── dashboardHandlers.ts           │   ├── projectHandlers.ts
│       (all handlers in one file)     │   ├── statusHandlers.ts
                                       │   └── index.ts

Pattern C: Object literals (CURRENT)   Pattern D: One handler per file
├── handlers/                          ├── handlers/
│   ├── meshHandlers.ts                │   ├── handleStart.ts
│   ├── index.ts                       │   ├── handleStop.ts
│   └── (dispatchHandler from core)    │   └── index.ts
```

### Pick ONE Pattern

```typescript
// This project's established pattern: Object literal + dispatchHandler
// In [domain]Handlers.ts:
import { defineHandlers } from '@/core/handlers';

export const meshHandlers = defineHandlers({
    'check-api-mesh': handleCheckApiMesh,
    'deploy-api-mesh': handleDeployApiMesh,
    'get-mesh-status': handleGetMeshStatus,
});

// In command file:
import { dispatchHandler } from '@/core/handlers';
import { meshHandlers } from '@/features/mesh/handlers';

const result = await dispatchHandler(meshHandlers, context, messageType, data);
```

### Handler Signature Consistency

```typescript
// ❌ INCONSISTENT: Different signatures
// Feature A:
type HandlerA = (context: Context, payload: unknown) => Promise<Response>;

// Feature B:
type HandlerB = (context: Context) => (payload: unknown) => Promise<Response>;

// ✅ CONSISTENT: Same signature everywhere
type MessageHandler<T = unknown> = (
    context: HandlerContext,
    payload?: T,
) => Promise<HandlerResponse>;
```

### Scan Pattern

```bash
# Compare handler directory structures
for dir in src/features/*/handlers; do
    echo "=== $dir ==="
    ls -la "$dir" 2>/dev/null | head -10
done

# Find handler object literals (should exist)
grep -l "defineHandlers\|= {$" src/features/*/handlers/*Handlers.ts

# Find OLD registry patterns (should NOT exist)
grep -l "class.*Registry\|extends.*Registry" src/features/*/handlers/*.ts
```

### Violations to Check

- [ ] Different handler organization across features
- [ ] Using class-based Registry instead of object literals
- [ ] Missing `dispatchHandler` usage in command files
- [ ] Inconsistent handler function signatures
- [ ] Shared helpers in different locations (`shared.ts` vs inline)

---

## 16. RPTC Workflow Integration

### SOP Scan Integration

```bash
# Full consistency scan (all 15 patterns)
/sop-scan --category consistency

# Code-level patterns only
/sop-scan --pattern webview-communication
/sop-scan --pattern handler-responses
/sop-scan --pattern props-threading

# Architectural patterns only
/sop-scan --pattern services       # Service layer consistency
/sop-scan --pattern injection      # Dependency injection
/sop-scan --pattern composition    # Composition vs inheritance
/sop-scan --pattern facades        # Module boundaries
/sop-scan --pattern handlers-arch  # Handler architecture
```

### Master Efficiency Agent

When reviewing code, check for:

**Code-Level:**
1. Communication pattern consistency (request vs postMessage)
2. Handler response format consistency
3. Shared logic extraction opportunities
4. Props threading completeness
5. Error handling consistency

**Architectural:**
6. Service layer presence/absence across features
7. Dependency injection patterns (context vs direct instantiation)
8. Composition vs inheritance consistency
9. Module boundary enforcement (facade pattern)
10. Handler architecture organization

### TDD Implementation

When implementing new features:
1. Check existing features for established architectural patterns
2. Use same service layer pattern as sibling features
3. Inject dependencies via context (not direct instantiation)
4. Export only public API via index.ts
5. Follow established handler organization pattern

---

## 17. Quick Reference for AI Agents

### Before Writing New Handler

- [ ] Check existing handlers for response format pattern
- [ ] Check if similar logic exists to extract/reuse
- [ ] Use `context.logger` not `console`
- [ ] Return errors, don't throw

### Before Adding New Props

- [ ] Check all sibling components for same prop need
- [ ] Thread through entire hierarchy consistently
- [ ] Match naming convention (`on*`, `is*`, `has*`)

### Before Adding Delays/Timeouts

- [ ] Check if TIMEOUTS constant exists
- [ ] If not, add to timeoutConfig.ts first
- [ ] In webview, use local constant with cross-reference comment

### Before Creating New Feature

- [ ] Check if sibling features have `services/` directory
- [ ] Use same handler organization pattern (object literals + dispatchHandler)
- [ ] Create index.ts with curated public API
- [ ] Use context-based dependency injection
- [ ] Prefer hooks over HOCs for React components

### During Code Review

- [ ] Is this operation done the same way elsewhere?
- [ ] Are siblings treated consistently?
- [ ] Does this follow the established pattern in this module?
- [ ] Are architectural patterns consistent with other features?

---

## 18. Summary

### Part A: Code-Level Consistency

| # | Pattern | Detection | Threshold |
|---|---------|-----------|-----------|
| 1 | Webview Communication | postMessage vs request usage | Must match need (response/fire-forget) |
| 2 | Handler Responses | Return format | Must use `{ success, data/error }` |
| 3 | Shared Logic | Duplicate code blocks | Extract at 2+ occurrences |
| 4 | Props Threading | Sibling component props | Must be consistent |
| 5 | State Persistence | Delay values | Must use TIMEOUTS constants |
| 6 | Error Handling | Catch block patterns | Must be uniform |
| 7 | Import Paths | Relative vs alias | Use alias for cross-feature |
| 8 | Naming Conventions | Handler/prop names | Follow prefix patterns |
| 9 | Feature Structure | Directory layout | Follow standard structure |
| 10 | Test Organization | Test file locations | Mirror source structure |

### Part B: Architectural Consistency

| # | Pattern | Detection | Threshold |
|---|---------|-----------|-----------|
| 11 | Service Layer | services/ presence | Complex features need services |
| 12 | Dependency Injection | context vs new | Use context-based injection |
| 13 | Composition vs Inheritance | extends vs composition | Prefer composition, be consistent |
| 14 | Module Boundaries | index.ts exports | Curated public API per feature |
| 15 | Handler Architecture | Object literals | Use dispatchHandler pattern |

---

**Golden Rule**: If the same thing is done differently in two places, one of them is wrong.

**Enforcement**: All patterns checked by `/sop-scan --category consistency` and Master Efficiency Agent during TDD quality gates.
