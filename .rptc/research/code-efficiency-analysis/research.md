# Code Efficiency Analysis

**Date**: 2025-11-21
**Scope**: Codebase-only
**Depth**: Comprehensive (ultrathink)

## Summary

Found **~700-900 lines of duplicated code** across the codebase, plus several missing abstractions and architectural inconsistencies. The most critical issues are exact file duplicates and missing generic patterns.

---

## 1. Critical: Exact File Duplicates

### 1.1 Setup Instructions Helper (80 lines)
- `src/commands/helpers/setupInstructions.ts`
- `src/features/project-creation/helpers/setupInstructions.ts`
- **Status**: 100% duplicate
- **Impact**: Changes need to be made in two places

### 1.2 Formatters Helper (18 lines)
- `src/commands/helpers/formatters.ts`
- `src/features/project-creation/helpers/formatters.ts`
- **Status**: 100% duplicate
- **Impact**: Wasted code duplication

### 1.3 useDebouncedValue Hook (43 lines)
- `src/core/ui/hooks/useDebouncedValue.ts`
- `src/features/dashboard/ui/hooks/useDebouncedValue.ts`
- **Status**: 100% duplicate
- **Impact**: Unclear which version should be used

### 1.4 useDebouncedLoading Hook (69-71 lines)
- `src/core/ui/hooks/useDebouncedLoading.ts`
- `src/features/authentication/ui/hooks/useDebouncedLoading.ts`
- **Status**: 99% identical (minor cleanup function difference)
- **Impact**: Two implementations that should be kept in sync

### 1.5 useMinimumLoadingTime Hook (80-82 lines)
- `src/core/ui/hooks/useMinimumLoadingTime.ts`
- `src/features/authentication/ui/hooks/useMinimumLoadingTime.ts`
- **Status**: 100% duplicate
- **Impact**: Import confusion; maintenance burden

### 1.6 HandlerContext Re-exports (26 lines)
- `src/commands/handlers/HandlerContext.ts`
- `src/features/project-creation/handlers/HandlerContext.ts`
- **Status**: 100% duplicate
- **Impact**: Redundant exports

**Total Duplicated: ~316 lines**

---

## 2. Multiple Implementations of Same Functionality

### 2.1 Error Formatting (2 approaches)
| Location | Approach |
|----------|----------|
| `src/features/mesh/utils/errorFormatter.ts` | Functional (`formatAdobeCliError`, `formatMeshDeploymentError`) |
| `src/features/authentication/services/authenticationErrorFormatter.ts` | Static class (`AuthenticationErrorFormatter.formatError`) |

**Issue**: Inconsistent error handling approach across features

### 2.2 Cache Management (no abstraction)
| Location | Pattern |
|----------|---------|
| `src/features/authentication/services/authCacheManager.ts` | TTL + jitter |
| `src/features/prerequisites/services/prerequisitesCacheManager.ts` | TTL + jitter |

**Issue**: Both implement `getCacheTTLWithJitter()` method independently

### 2.3 Handler Registries (2 patterns)
| Location | Pattern | Lines |
|----------|---------|-------|
| `src/commands/handlers/HandlerRegistry.ts` | Legacy standalone with Map | 142 |
| `src/features/project-creation/handlers/HandlerRegistry.ts` | New extends BaseHandlerRegistry | 90 |

**Issue**: Two different handler patterns; same message registrations duplicated

### 2.4 Validation Logic (scattered)
- `src/core/validation/fieldValidation.ts` - UI field validation
- `src/features/project-creation/helpers/index.ts` - Simple field validation
- `src/features/authentication/services/organizationValidator.ts` - Org-specific

**Issue**: Unclear where to put new validation

---

## 3. Missing Industry Standard Patterns

### 3.1 Missing Generic Cache Abstraction
- **Current**: Each feature implements its own cache
- **Missing**: `ICache<T>` interface or `AbstractCacheManager<T>` base class
- **Impact**: TTL/jitter logic repeated; inconsistent cache behavior
- **Recommendation**: Create `AbstractCacheManager<T extends CacheEntry>` in `@/core`

### 3.2 Missing Error Formatter Strategy
- **Current**: Error formatting via functions OR static class
- **Missing**: `IErrorFormatter` interface
- **Impact**: Inconsistent error messages; difficult to add new error types
- **Recommendation**: Create `AbstractErrorFormatter` base class

### 3.3 Missing Validation Abstraction
- **Current**: Validation inline or inconsistently structured
- **Missing**: `IValidator<T>` interface
- **Impact**: Duplicated validation logic
- **Recommendation**: Create validator interface following composition pattern

### 3.4 Missing Handler Adapter Pattern
- **Current**: Handler registries duplicate message mappings
- **Missing**: Single source of truth for message mappings
- **Recommendation**: Use adapter pattern or consolidated registry

### 3.5 Missing UI Hook Composition
- **Current**: 3 separate hooks (useDebouncedValue, useDebouncedLoading, useMinimumLoadingTime)
- **Missing**: Hook composition factory or clear hierarchy
- **Recommendation**: Create `useDebounce()` family with clear naming

---

## 4. Architectural Inconsistencies

### 4.1 Core vs Shared Module Confusion
- Documentation references `@/shared/*` but codebase uses `@/core/*`
- `@/core/*` has 170+ imports (primary infrastructure)
- `@/shared/*` only used for validation (3 imports)
- `src/core/validation/index.ts` re-exports from `@/shared/validation`

**Impact**: Confusing path alias choices; unclear boundaries

### 4.2 Handler Pattern Migration Incomplete
- Legacy pattern in `commands/handlers/HandlerRegistry.ts`
- New pattern in `features/project-creation/handlers/HandlerRegistry.ts`

**Impact**: Two different patterns; unclear which to follow

### 4.3 Helper Files vs Service Classes
- Business logic in `helpers/` (e.g., setupInstructions, formatters)
- Should be in `services/`

**Impact**: Unclear architectural boundaries

---

## 5. Recommendations

### Quick Wins (Low effort, high impact)
1. Delete duplicate files in `src/features/*/helpers/` and `src/features/*/ui/hooks/`
2. Update imports to use `@/core` versions
3. Delete duplicate `HandlerContext.ts` files

### Medium Effort
1. Create `AbstractCacheManager<T>` in `@/core/cache/`
2. Consolidate error formatters to single pattern
3. Document `@/core` vs `@/shared` decision

### Larger Refactor
1. Consolidate handler registries to single pattern
2. Create validation abstraction layer
3. Refactor hook composition

---

## Files to Delete (Quick Wins)

```
src/commands/helpers/setupInstructions.ts          # Keep project-creation version
src/commands/helpers/formatters.ts                 # Keep project-creation version
src/features/dashboard/ui/hooks/useDebouncedValue.ts      # Keep core version
src/features/authentication/ui/hooks/useDebouncedLoading.ts # Keep core version
src/features/authentication/ui/hooks/useMinimumLoadingTime.ts # Keep core version
src/features/project-creation/handlers/HandlerContext.ts  # Keep commands version
```

**Estimated savings**: ~316 lines of duplicated code

---

## 6. Business Logic Extraction Opportunities

### 6.1 High Priority Extractions

#### Project Creation Executor (executor.ts:45-457)
**~400 lines of orchestration logic**

| Logic | Lines | Extract To |
|-------|-------|------------|
| Port conflict detection & auto-resolution | 58-83 | `ProjectConflictResolver` |
| Component installation orchestration | 168-227 | `ComponentInstallationOrchestrator` |
| Mesh deployment branching (new vs existing) | 229-358 | `MeshDeploymentStrategy` |
| Component version detection (3-tier) | 179-240 | `ComponentVersionDetector` |
| Project manifest generation | 360-382 | `ProjectManifestBuilder` |

#### Wizard Navigation Logic (WizardContainer.tsx:295-350)
**Complex state machine with dependencies**
- Step dependency model (workspace depends on project)
- Dependent state clearing on backward navigation
- Animation timing coordination
- Completed step tracking

**Extract to:** `WizardNavigationHandler`

#### Project Switching Logic (commandManager.ts:87-179)
**Duplicated across 2 commands (switchProject & loadProject)**
- Running demo check + conditional stop
- Load project validation and state update
- Dashboard display after switch

**Extract to:** `ProjectSwitchingService`

#### Mesh Status State Machine (ApiMeshStep.tsx:52-155)
**Complex 3-path decision tree**
- API enabled/disabled detection
- Mesh existence checking
- Error state determination

**Extract to:** `MeshCheckService`

#### Component Dependencies Resolution (ComponentSelectionStep.tsx:234-260)
**Hardcoded business rules**
- Frontend → commerce-mesh dependency
- Backend → catalog-service, live-search dependencies

**Extract to:** `ComponentDependencyResolver` (make data-driven)

---

### 6.2 Medium Priority Extractions

| Area | File | Lines | Extract To |
|------|------|-------|------------|
| Mesh polling | createHandler.ts | 224-350 | `MeshPollingStrategy` |
| Env var resolution (4-tier) | envFileGenerator.ts | 85-107 | `EnvVarResolver` |
| Status formatting | ProjectDashboardScreen.tsx | 141-197 | `StatusFormatter` |
| Component sections | ReviewStep.tsx | 53-163 | `ComponentSectionBuilder` |
| Project deletion | deleteProject.ts | 23-72 | `ProjectDeletionManager` |
| Port change workflow | configure.ts | 125-161 | `ComponentConfigurationManager` |
| Mesh error recovery | ApiMeshStep.tsx | 266-340 | `MeshRecoveryHandler` |
| Prerequisites parsing | PrerequisitesStep.tsx | 372-420 | `PrerequisiteMessageParser` |
| Diagnostics orchestration | diagnostics.ts | 117-476 | `DiagnosticsCollector` |
| Action availability | viewStatus.ts | 74-84 | `ProjectActionAvailabilityService` |
| Inspector toggle | configure.ts | 83-111 | `InspectorToggleManager` |
| Reset all state | resetAll.ts | 8-104 | `ExtensionStateResetManager` |

---

### 6.3 Patterns to Extract as Base Classes

| Pattern | Used In | Base Class |
|---------|---------|------------|
| 3-tier fallback strategies | version detection, mesh endpoint, env vars | `FallbackResolver<T>` |
| Polling with intervals | mesh deployment (10×10s) | `PollingStrategy` |
| Multi-step workflows | project creation, component update, reset | `WorkflowOrchestrator` |
| Error classification | mesh, auth, update handlers | `ErrorClassifier` |
| Status display formatting | dashboard (demo + mesh) | `StatusDisplayFormatter` |

---

### 6.4 Recommended Extraction Order

**Phase 1 - State Machines & Orchestration:**
1. `WizardNavigationHandler`
2. `MeshCheckService`
3. `ProjectConflictResolver`

**Phase 2 - Workflow Services:**
1. `ProjectSwitchingService`
2. `ComponentInstallationOrchestrator`
3. `ProjectDeletionManager`

**Phase 3 - Formatters & Resolvers:**
1. `StatusFormatter`
2. `EnvVarResolver`
3. `ComponentDependencyResolver`

**Phase 4 - Base Classes:**
1. `PollingStrategy` base class
2. `ErrorClassifier`
3. `FallbackResolver<T>`

---

## 7. Total Estimated Impact

| Category | Lines Affected | Priority |
|----------|---------------|----------|
| Exact duplicates to delete | ~316 | Quick win |
| Business logic to extract | ~1500+ | Medium-term |
| Missing abstractions | ~300 | Medium-term |
| **Total refactoring scope** | **~2100+ lines** | |

---

## 8. Complexity Assessment

### 8.1 High Cyclomatic Complexity (CC > 10)

| File | Lines | CC | Primary Issue |
|------|-------|-----|---------------|
| `mesh/handlers/checkHandler.ts` | 385 | ~12-14 | Multi-layer error handling, 8+ regex patterns |
| `project-creation/handlers/executor.ts` | 457 | ~11-13 | Mesh deployment branching, component installation |
| `mesh/handlers/createHandler.ts` | 200+ | ~11-12 | Output parsing, progress tracking callbacks |

### 8.2 Large Files (500+ lines)

| File | Lines | Responsibilities |
|------|-------|------------------|
| `adobeEntityService.ts` | 913 | Entity mapping, SDK/CLI fallback, caching |
| `PrerequisitesManager.ts` | 671 | Config loading, version resolution, lookups |
| `ComponentRegistryManager.ts` | 655 | Validation, transformation, error handling |
| `authenticationService.ts` | 589 | OAuth flow, token management, org/project selection |
| `extension.ts` | 522 | 14+ initialization responsibilities |
| `stateManager.ts` | 500 | State persistence, project loading, file operations |

### 8.3 Deep Nesting (4+ levels)

- `checkHandler.ts:93-374` - 4-5 levels of nested try-catch with error recovery
- `executor.ts:233-358` - 3-4 levels for mesh deployment branching
- `dashboardHandlers.ts:106-178` - Nested if-else for mesh status determination

---

## 9. Coupling and Cohesion Issues

### 9.1 Critical: HandlerContext God Object

**122 usages** across the codebase. Contains:
- 6 optional managers (prereqManager, authManager, componentHandler, etc.)
- 2 loggers
- VS Code integration (context, panel, stateManager)
- Communication manager
- SharedState (by reference)

**Problem**: Every handler receives entire context, creating hidden dependencies and making testing difficult.

### 9.2 Cross-Feature Coupling

| Feature | Imports From | Files Affected |
|---------|-------------|----------------|
| mesh | project-creation/handlers/HandlerContext | 4 files |
| prerequisites | project-creation/handlers/HandlerContext | 4 files |
| lifecycle | project-creation/handlers/HandlerContext | 1 file |
| authentication | project-creation/handlers/HandlerContext | 1 file |

**Impact**: HandlerContext should be in `@/types` or `@/core`, not feature-specific.

### 9.3 SharedState Mutation Issues

SharedState passed by reference allows implicit mutations:
- `isAuthenticating`, `projectCreationAbortController`
- `meshCreatedForWorkspace`, `meshExistedBeforeSession`
- Changes by one handler appear in others without explicit tracking

---

## 10. Code Smells

### 10.1 Magic Numbers (Timeouts)

Despite `timeoutConfig.ts`, scattered hardcoded timeouts remain:
- `stalenessDetector.ts:87` - `timeout: 30000`
- `meshEndpoint.ts:26` - `timeout: 5000`
- `executor.ts:263` - `timeout: 30000`
- `environmentSetup.ts:347,362,391` - Multiple 2000-5000ms values

### 10.2 Primitive Obsession (Status Strings)

Status values as string unions instead of enums:
- `MeshStatus` - 9 string values in `ProjectDashboardScreen.tsx:26`
- `ComponentStatus` - scattered 'not-installed', 'ready', 'installing'
- Inconsistent status values across files (pending vs checking)

### 10.3 Long Functions

| File | Function | Lines |
|------|----------|-------|
| executor.ts | executeProjectCreation | 457 |
| checkHandler.ts | handleCheckApiMesh | 385 |
| authenticationService.ts | login | 121 |
| dashboardHandlers.ts | handleRequestStatus | 155+ |

### 10.4 Dead Code / Historical Comments

- `lifecycleHandlers.ts:147-151` - "REMOVED (Package 4 - beta.64)" comments
- `environmentSetup.ts:215` - TODO in code instead of issue tracker
- Multiple `// Previously...` comments documenting old behavior

---

## 11. Test Coverage Gaps

### 11.1 Critical Untested Files

| File | Criticality | Issue |
|------|-------------|-------|
| `extension.ts` | CRITICAL | Main activation flow untested |
| `createProject.ts` (command) | CRITICAL | Project creation wizard untested |
| `debugLogger.ts` | HIGH | Core logging infrastructure |
| `errorLogger.ts` | HIGH | Error tracking, status bar integration |
| `startDemo.ts` / `stopDemo.ts` | HIGH | Demo lifecycle commands |
| `deployMesh.ts` | HIGH | Mesh deployment command |
| `deleteProject.ts` | HIGH | Deletion with confirmation/cleanup |

### 11.2 Entirely Untested Categories

| Category | Files | Impact |
|----------|-------|--------|
| UI Hooks | 13 files | All async/message/selection hooks |
| UI Components | 26 files | All core components |
| UI Contexts | 3 files | Theme, Wizard, VSCode contexts |
| Commands | 10+ files | Command orchestration layer |

### 11.3 Estimated Coverage Gap

- **Total untested source files**: ~75+ files
- **Critical business logic without tests**: 7 major areas
- **Test organization**: Good structure, but command layer and UI entirely untested

---

## 12. Consolidated Recommendations

### Phase 1: Quick Wins (1-2 days)
1. Delete 6 duplicate files (~316 lines)
2. Consolidate timeouts to `TIMEOUTS` constant
3. Create status enums (MeshStatus, ComponentStatus)
4. Remove dead code / historical comments

### Phase 2: Infrastructure (1 week)
1. Move HandlerContext to `@/types/handlers.ts`
2. Create `AbstractCacheManager<T>` base class
3. Add critical test coverage (extension.ts, commands)
4. Consolidate error formatters

### Phase 3: Refactoring (2-3 weeks)
1. Split large files (adobeEntityService, PrerequisitesManager, StateManager)
2. Extract business logic from handlers (executor.ts, checkHandler.ts)
3. Replace SharedState reference mutations with explicit state updates
4. Add integration tests for command layer

### Phase 4: Long-term (Ongoing)
1. Add UI component tests
2. Create base classes for common patterns
3. Document naming conventions (Service vs Manager)
4. Reduce cyclomatic complexity in high-CC files

---

## 13. Updated Impact Summary

| Category | Items | Lines/Files | Priority |
|----------|-------|-------------|----------|
| Exact duplicates | 6 files | ~316 lines | Quick win |
| Business logic extraction | 17 services | ~1500+ lines | Medium |
| High complexity files | 6 files | ~2500 lines | High |
| Large files to split | 6 files | ~4000 lines | Medium |
| Cross-feature coupling | 10 files | - | High |
| Test coverage gaps | ~75 files | - | Critical |
| Code smells to fix | ~50 instances | - | Medium |
| **Total scope** | **~100+ files** | **~8000+ lines** | |

---

## 14. Industry Code Smell Standards (Web Research)

### 14.1 Recommended Metrics and Thresholds

| Metric | Warning | Error | Tool |
|--------|---------|-------|------|
| Cyclomatic Complexity | 10 | 20 | ESLint `complexity` rule |
| Cognitive Complexity | 10 | 15 | eslint-plugin-sonarjs |
| Function Lines | 30 | 50 | ESLint `max-lines-per-function` |
| File Lines | 300 | 500 | ESLint `max-lines` |
| Parameters | 3 | 5 | ESLint `max-params` |
| Nesting Depth | 3 | 4 | ESLint `max-depth` |

### 14.2 TypeScript-Specific Smells

| Smell | Example | Fix |
|-------|---------|-----|
| `any` type abuse | `const data: any` | Use proper types, `unknown`, or generics |
| Non-null assertions | `obj!.property` | Use optional chaining `?.` or guards |
| Type assertion abuse | `value as SomeType` | Use type guards or discriminated unions |
| Multiple booleans for state | `isLoading, hasError` | Use discriminated union or enum |
| Interface bloat | >15 properties | Split into focused interfaces |
| Optional property overuse | Many `prop?: type` | Use discriminated unions |

### 14.3 React-Specific Smells

| Smell | Threshold | Fix |
|-------|-----------|-----|
| Large component | >200 lines | Extract child components |
| Too many props | >5-7 props | Composition, context, or split |
| Too many useState | >3-4 hooks | useReducer or custom hook |
| Prop drilling | >2 levels | Context API or state management |
| Large useEffect | Multiple concerns | Split into multiple effects |
| Derived state in useState | Computable from other state | Compute during render |

### 14.4 VS Code Extension Smells

| Smell | Indicator | Fix |
|-------|-----------|-----|
| No handshake protocol | Messages lost during init | Implement ready/ack pattern |
| Untyped messages | `postMessage({ type: string })` | Use typed message interfaces |
| Missing error handling | No response timeout | Add timeout + retry logic |
| No disposables tracking | Memory leaks | Track and dispose subscriptions |
| Global mutable state | Module-level `let` | Use ExtensionContext.globalState |
| Race conditions | Concurrent modifications | Command queuing/mutex |

### 14.5 Classic Fowler Smells Reference

**Bloaters:**
- Long Method (>30-50 lines) → Extract Method
- Large Class (>300-500 lines) → Extract Class
- Long Parameter List (>3-4 params) → Parameter Object
- Primitive Obsession → Value Objects
- Data Clumps → Extract Class

**Dispensables:**
- Dead Code → Delete it
- Duplicated Code → Extract Method/Class
- Speculative Generality → Remove until needed

**Couplers:**
- Feature Envy → Move Method
- Message Chain (`a.getB().getC()`) → Hide Delegate
- Inappropriate Intimacy → Move/Extract methods

### 14.6 Recommended ESLint Configuration

```javascript
{
  "rules": {
    // Complexity
    "complexity": ["warn", 10],
    "max-lines": ["warn", { "max": 300 }],
    "max-lines-per-function": ["warn", { "max": 50 }],
    "max-params": ["warn", 4],
    "max-depth": ["warn", 3],

    // TypeScript
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-non-null-assertion": "warn",
    "@typescript-eslint/prefer-optional-chain": "warn",

    // SonarJS
    "sonarjs/cognitive-complexity": ["warn", 15],
    "sonarjs/no-duplicate-string": "warn"
  }
}
```

### 14.7 Code Review Checklist

**TypeScript:**
- [ ] No `any` types without justification
- [ ] No type assertions without type guards
- [ ] Interfaces focused (<10 properties)
- [ ] No duplicate type definitions

**React:**
- [ ] Components <200 lines
- [ ] <5 props per component
- [ ] <4 useState hooks per component
- [ ] No prop drilling >2 levels
- [ ] useEffect has single responsibility

**VS Code Extension:**
- [ ] Webview messages typed
- [ ] Handshake protocol implemented
- [ ] All disposables tracked and disposed
- [ ] State persisted appropriately

**General:**
- [ ] Functions <50 lines
- [ ] Files <300 lines (warning), <500 (error)
- [ ] No dead/commented-out code
- [ ] No duplicate code blocks
- [ ] Single responsibility per function/class

**Sources:** Martin Fowler "Refactoring" (2018), luzkan.github.io/smells, refactoring.guru, ESLint docs, eslint-plugin-sonarjs, VS Code API docs

---

## 15. TypeScript Code Smell Analysis

### 15.1 Summary Statistics

| Type | Count | Files | Assessment |
|------|-------|-------|------------|
| `: any` type annotations | 305 | 108 | Moderate - mostly tests |
| `as any` assertions | 410 | 103 | Moderate - webview data |
| `<any>` generic usage | 13 | 9 | Low |
| `!:` non-null assertions | 3 | 2 | Very low |
| `as SomeType` assertions | 3,302 | 413 | Mixed - many legitimate |

### 15.2 Top Violators

| File | Violations | Primary Issue |
|------|------------|---------------|
| `stateManager-errorHandling.test.ts` | ~50 | Error type casting in tests |
| `stateManager-utilities.test.ts` | ~37 | Test data construction |
| `authenticationHandlers-messages.test.ts` | ~70 | Mock setup with `as any` |
| `configure.test.ts` | ~40 | Handler context mocking |
| `WizardContainer.tsx` | ~10 | Ref and data casting |
| `ProjectDashboardScreen.tsx` | ~25 | Webview message handling |

### 15.3 Critical Issues

| File | Line | Code | Fix |
|------|------|------|-----|
| WizardContainer.tsx | 493 | `ref={wizardContainerRef as any}` | Use `React.RefObject<HTMLDivElement>` |
| WizardContainer.tsx | 450 | `as unknown as Record<string, unknown>` | Fix source types |
| ProjectDashboardScreen.tsx | 75 | `meshData.status as any` | Type webview messages |
| VSCodeContext.tsx | 8 | `<T = any>` | Use `<T = unknown>` |

### 15.4 Recommendations

1. **Create typed webview message definitions** - addresses ~400 `as any` in UI
2. **Create mock factory types for tests** - addresses ~200 test violations
3. **Add ESLint rule** `@typescript-eslint/no-explicit-any`

---

## 16. React Code Smell Analysis

### 16.1 Component Size Violations (>200 lines)

| Component | Lines | Severity | Issues |
|-----------|-------|----------|--------|
| ComponentConfigStep.tsx | 1,025 | **CRITICAL** | Field management, validation, navigation mixed |
| ComponentSelectionStep.tsx | 530 | High | Focus management, selection logic |
| ApiMeshStep.tsx | 472 | High | Async operations, state machines |
| AdobeAuthStep.tsx | 381 | High | 8 conditional render branches |
| WizardContainer.tsx | 400+ | Moderate | Orchestration complexity |
| PrerequisitesStep.tsx | 200+ | Moderate | Scroll and install logic |

### 16.2 useState Violations (>4 per component)

| Component | useState Count | Should Extract |
|-----------|---------------|----------------|
| ComponentConfigStep.tsx | 7 | `useConfigForm()` hook |
| ConfigureScreen.tsx | 7 | `useConfigForm()` hook |
| AdobeAuthStep.tsx | 6 | `useAuthState()` hook |
| ComponentSelectionStep.tsx | 6 | `useSelections()` hook |
| ApiMeshStep.tsx | 5 | `useMeshState()` hook |
| ProjectDashboardScreen.tsx | 5+ | `useDashboardState()` hook |

### 16.3 Prop Drilling Patterns

| Pattern | Depth | Location |
|---------|-------|----------|
| Wizard state → Step → SearchableList | 3+ levels | WizardContainer hierarchy |
| Config state → Section → Field | 3+ levels | ConfigureScreen hierarchy |
| Validation → Section → Field → Input | 4 levels | ComponentConfigStep |

### 16.4 Recommended Extractions

**Phase 1 - ComponentConfigStep.tsx (1,025 lines):**
- `ConfigurationForm` - Field rendering
- `ValidationManager` - Validation logic
- `ConfigNavigationPanel` - Sidebar
- `FieldRenderer` - Individual fields

**Phase 2 - AdobeAuthStep.tsx (381 lines):**
- `AuthLoadingState` component
- `AuthErrorState` component
- `AuthSuccessState` component

---

## 17. VS Code Disposables Analysis

### 17.1 Subscription Summary

| Category | Count | Cleanup Status |
|----------|-------|----------------|
| context.subscriptions | 22 | ✅ All disposed |
| CommandManager commands | 20+ | ✅ Map-based cleanup |
| Webview communication | 1 | ✅ Disposables array |
| File watchers | 2+ | ✅ Map-based cleanup |
| State change events | 1 | ✅ EventEmitter disposed |
| **Component tree listener** | **1** | **⚠️ NO CLEANUP** |
| **TOTAL** | **51** | **96% managed** |

### 17.2 Memory Leak Found

**File:** `src/features/components/providers/componentTreeProvider.ts`

```typescript
// Line 24-26 - LEAK
stateManager.onProjectChanged(() => {
    this.refresh();
});
// No unsubscribe / cleanup
```

**Fix:**
```typescript
private projectChangedDisposable: vscode.Disposable | undefined;

constructor(stateManager: StateManager, extensionPath: string) {
    this.projectChangedDisposable = stateManager.onProjectChanged(() => {
        this.refresh();
    });
}

dispose(): void {
    this.projectChangedDisposable?.dispose();
}
```

### 17.3 Properly Managed Files

- `extension.ts` - 15 subscriptions, deactivate() cleanup
- `commandManager.ts` - Map-based dispose()
- `baseWebviewCommand.ts` - Disposables array pattern
- `webviewCommunicationManager.ts` - Disposables array
- `fileWatcher.ts` - Map-based cleanup
- `stateManager.ts` - EventEmitter disposed
- `errorLogger.ts`, `debugLogger.ts` - Explicit dispose()

---

## 18. Section 14 Coverage Matrix

| Category | Coverage | Notes |
|----------|----------|-------|
| **14.1 Metrics** | 83% | Missing: cognitive complexity (needs tooling) |
| **14.2 TypeScript Smells** | 95% | 3,728 violations found, priorities identified |
| **14.3 React Smells** | 90% | 6 large components, 6 useState violations |
| **14.4 VS Code Extension** | 100% | 1 memory leak found |
| **14.5 Fowler Smells** | 100% | Covered in sections 1-10 |
| **Overall** | **~95%** | Ready for planning phase |

---

## 19. Final Prioritized Roadmap

### Quick Wins (1-2 days)
1. Fix ComponentTreeProvider memory leak (1 file)
2. Delete 6 duplicate files (~316 lines)
3. Create status enums (MeshStatus, ComponentStatus)

### Short Term (1 week)
4. Type webview messages (addresses 400+ `as any`)
5. Create mock factory types for tests
6. Split ComponentConfigStep.tsx (1,025 lines → 4 components)

### Medium Term (2-3 weeks)
7. Extract useState hooks to custom hooks (6 components)
8. Split remaining large components (5 files)
9. Add `@typescript-eslint/no-explicit-any` ESLint rule

### Long Term (Ongoing)
10. Reduce prop drilling with Context API
11. Add UI component tests (~26 untested files)
12. Create base classes for common patterns

---

**Research Status:** Complete (95% coverage of Section 14 categories)

---

## 20. Cognitive Complexity Analysis

### 20.1 Estimated Scores

| File | Lines | Est. CC | Primary Issue | Max Nesting |
|------|-------|---------|---------------|-------------|
| createHandler.ts | 378 | **19-24** | While loop polling with 3-level nesting | 4 levels |
| checkHandler.ts | 385 | **18-22** | Multiple fallback layers + repeated patterns | 4-5 levels |
| executor.ts | 457 | **16-20** | Loop with internal branching | 3 levels |

### 20.2 Repeated Complexity Patterns

**Pattern 1: Status Checking (appears 5x)**
```typescript
if (meshStatus === 'deployed' || meshStatus === 'success') { ... }
else if (meshStatus === 'error' || meshStatus === 'failed') { ... }
else { /* pending */ }
```
- Adds +3 CC per occurrence
- **Fix**: Extract to `getMeshStatusCategory()` helper

**Pattern 2: Nested Regex + JSON Parsing (appears 2x)**
```typescript
const jsonMatch = /\{[\s\S]*\}/.exec(stdout);
if (!jsonMatch) { /* handle */ }
const meshData = parseJSON<Type>(jsonMatch[0]);
```
- Adds +2-3 CC per occurrence
- **Fix**: Extract to `extractAndParseJSON<T>()` helper

**Pattern 3: Polling Loop with State Mutations**
- Location: createHandler.ts lines 241-333
- Variables mutated: `attempt`, `meshDeployed`, `deployedMeshId`, `deployedEndpoint`
- **Fix**: Extract to `pollForMeshDeployment()` returning result object

### 20.3 Hotspots

| Location | Lines | Issue |
|----------|-------|-------|
| checkHandler.ts | 106-374 | 4 nested try-catch blocks, 11 early returns |
| createHandler.ts | 241-333 | While loop with 3-level nesting |
| executor.ts | 178-227 | Loop with 3-level if-else per iteration |

### 20.4 Refactoring Impact

| Extraction | CC Reduction |
|------------|--------------|
| `getMeshStatusCategory()` | -9 points (5 occurrences × ~2) |
| `extractAndParseJSON<T>()` | -6 points |
| `pollForMeshDeployment()` | -5-7 points |
| Split checkHandler into 3 functions | -8-10 points |

---

## 21. Interface Bloat Analysis

### 21.1 Critical Bloat (>15 properties)

| Interface | File | Properties | Optional % | Severity |
|-----------|------|------------|------------|----------|
| RawComponentDefinition | types/components.ts | 13 + 19 nested | 85% | **SEVERE** |
| WizardState | types/webview.ts | 13 + 11 nested | 77% | **SEVERE** |
| Project | types/base.ts | 17 + 10 nested | 71% | **SEVERE** |
| HandlerContext | types/handlers.ts | 10 | 60% | HIGH |

### 21.2 WizardState Issues

```typescript
// Current: 13 top-level + 11 nested = 24 logical properties
interface WizardState {
    currentStep, projectName, projectTemplate,  // Core
    components?, componentConfigs?,              // Selections
    adobeAuth, adobeOrg?, adobeProject?, adobeWorkspace?, // Adobe
    commerceConfig?, creationProgress?,          // Config
    projectSearchFilter?,                        // UI
    projectsCache?, workspacesCache?, organizationsCache?, // CACHE LEAK
    apiVerification?, apiMesh?                   // Status
}
```

**Problems:**
- Cache properties don't belong in serialized state
- Mixes step state, data state, and status tracking
- 77% optional = unclear contract

**Recommended Split:**
- `WizardStepState` - Core navigation
- `WizardSelections` - User choices
- `WizardOperationStatus` - Status tracking
- `WizardCache` - Transient cache (separate)

### 21.3 HandlerContext Issues

```typescript
// 60% optional managers
interface HandlerContext {
    prereqManager?: PrerequisitesManager;    // optional
    authManager?: AuthenticationService;      // optional
    componentHandler?: IComponentHandler;     // optional
    // ... 6 more optional properties
}
```

**Problem:** "Optional - not all handlers need all managers" is a code smell

**Fix:** Use handler-specific context types:
- `BaseHandlerContext` - Common properties
- `AuthHandlerContext extends BaseHandlerContext` - Auth-specific
- `PrereqHandlerContext extends BaseHandlerContext` - Prerequisites-specific

### 21.4 Design Patterns Causing Bloat

| Pattern | Example | Fix |
|---------|---------|-----|
| God Objects | WizardState, Project | Composition |
| High Optional Ratios | HandlerContext (60%) | Specific subtypes |
| Inline Nested Objects | apiMesh (6 props inline) | Named interfaces |
| Backward Compat Cruft | createdAt + created | Migrate and remove |

---

## 22. useEffect Analysis

### 22.1 Critical Violations

| File | Lines | Size | Concerns | Severity |
|------|-------|------|----------|----------|
| PrerequisitesStep.tsx | 89-208 | **119 lines** | 5+ listeners | **CRITICAL** |
| ComponentConfigStep.tsx | 383-486 | **103 lines** | Focus + scroll + nav | HIGH |
| AdobeAuthStep.tsx | 35-103 | **68 lines** | Auth + listener + timeout | HIGH |
| ConfigureScreen.tsx | 310-391 | **81 lines** | Focus + scroll | MEDIUM-HIGH |
| ComponentSelectionStep.tsx | 86-158 | **72 lines** | MutationObserver focus | MEDIUM |

### 22.2 PrerequisitesStep.tsx - Worst Offender

**Lines 89-208 (119 lines)** combines 5 unrelated concerns:
1. Installation complete event
2. Check stopped event
3. Prerequisite status updates + DOM manipulation
4. Auto-scrolling logic
5. Prerequisites complete event

**Should be split into:**
```typescript
useEffect(() => { setupInstallationCompleteListener(); }, []);
useEffect(() => { setupCheckStoppedListener(); }, []);
useEffect(() => { setupStatusListener(); }, [checks]);
useEffect(() => { setupCompleteListener(); }, []);
```

### 22.3 Dependency Array Issues

| File | Effect | Dependencies | Issue |
|------|--------|--------------|-------|
| PrerequisitesStep.tsx | Lines 89-208 | `[checks, versionComponentMapping]` | Too broad for 5 concerns |
| ComponentConfigStep.tsx | Lines 572-632 | `[componentConfigs, serviceGroups, updateState, setCanProceed]` | Validation runs on every change |
| WizardContainer.tsx | Lines 165-191 | `[state.currentStep, state.creationProgress]` | Broad trigger |

### 22.4 Recommended Extractions

**Custom Hooks to Create:**
- `useFieldFocus()` - Focus management pattern (used 3x)
- `useScrollSync()` - Scroll synchronization (used 2x)
- `useMessageListener()` - Webview message listeners (used 10x+)
- `useValidation()` - Form validation logic (used 2x)

### 22.5 Good Patterns Found

| File | Lines | Pattern |
|------|-------|---------|
| FadeTransition.tsx | 26-35 | Single concern, simple |
| ReviewStep.tsx | 41-50 | Single concern (validation) |
| WelcomeStep.tsx | 37-52 | Focused concerns |

---

## 23. Updated Coverage Matrix

| Category | Previous | Now | Notes |
|----------|----------|-----|-------|
| **14.1 Metrics** | 83% | **100%** | Cognitive complexity analyzed |
| **14.2 TypeScript** | 95% | **100%** | Interface bloat analyzed |
| **14.3 React** | 90% | **100%** | useEffect analysis complete |
| **14.4 VS Code** | 100% | 100% | - |
| **14.5 Fowler** | 100% | 100% | - |
| **Overall** | 95% | **100%** | All gaps filled |

---

## 24. Final Consolidated Roadmap

### Quick Wins (1-2 days)
1. Fix ComponentTreeProvider memory leak
2. Delete 6 duplicate files (~316 lines)
3. Extract `getMeshStatusCategory()` helper (-9 CC points)
4. Create status enums (MeshStatus, ComponentStatus)

### Short Term (1 week)
5. Split PrerequisitesStep useEffect (119 lines → 4 effects)
6. Type webview messages (addresses 400+ `as any`)
7. Extract `pollForMeshDeployment()` from createHandler.ts
8. Create `useMessageListener()` custom hook

### Medium Term (2-3 weeks)
9. Split WizardState into focused interfaces
10. Split ComponentConfigStep.tsx (1,025 lines → 4 components)
11. Create handler-specific context types (replace HandlerContext)
12. Extract validation logic to `useValidation()` hook

### Long Term (Ongoing)
13. Split checkHandler.ts into 3 focused functions
14. Reduce Project interface bloat (27 → 4 composed interfaces)
15. Add `@typescript-eslint/no-explicit-any` ESLint rule
16. Add UI component tests (~26 untested files)

---

**Research Status:** Complete (100% coverage of Section 14 categories)
