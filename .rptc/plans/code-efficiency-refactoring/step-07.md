# Step 7: Interface Decomposition

## Purpose

Split bloated interfaces into focused, composed types following Interface Segregation Principle (ISP). This improves type safety, reduces cognitive load, and enables partial updates without full object construction.

## Prerequisites

- [ ] Steps 1-6 completed (code consolidated)
- [ ] TypeScript strict mode enabled
- [ ] Understanding of existing interface usage patterns

## Tests to Write First

### Type Compilation Tests

- [ ] Test: WizardState composed types compile correctly
  - **Given:** New WizardStepState, WizardSelections, WizardOperationStatus, WizardCache interfaces
  - **When:** WizardState is defined as composition of these types
  - **Then:** All existing code using WizardState compiles without errors
  - **File:** `tests/types/wizardState.type-test.ts`

- [ ] Test: HandlerContext variant types compile correctly
  - **Given:** BaseHandlerContext, AuthHandlerContext, PrereqHandlerContext, MeshHandlerContext
  - **When:** Handlers receive their specific context type
  - **Then:** Type narrowing works correctly, optional properties become required where needed
  - **File:** `tests/types/handlerContext.type-test.ts`

- [ ] Test: Project composed types compile correctly
  - **Given:** ProjectBase, ProjectAdobeConfig, ProjectComponentState, ProjectDeploymentState
  - **When:** Project is intersection of these types
  - **Then:** Existing project operations work unchanged
  - **File:** `tests/types/project.type-test.ts`

- [ ] Test: RawComponentDefinition sub-types compile correctly
  - **Given:** ComponentDeploymentConfig, ComponentUIConfig, ComponentRuntimeConfig
  - **When:** RawComponentDefinition uses these sub-types
  - **Then:** Component registry parsing works unchanged
  - **File:** `tests/types/componentDefinition.type-test.ts`

### Backward Compatibility Tests

- [ ] Test: Existing WizardState usage continues to work
  - **Given:** Code that accesses wizardState.currentStep, wizardState.components
  - **When:** Using new composed WizardState type
  - **Then:** No breaking changes to property access
  - **File:** `tests/types/wizardState-compat.test.ts`

- [ ] Test: Existing HandlerContext usage continues to work
  - **Given:** Handlers accessing context.logger, context.stateManager
  - **When:** Using new BaseHandlerContext
  - **Then:** All existing handlers compile and run
  - **File:** `tests/types/handlerContext-compat.test.ts`

## Files to Create/Modify

### New Files

- [ ] `src/types/wizard/index.ts` - WizardState composed types
- [ ] `src/types/handlers/contexts.ts` - Handler context variants
- [ ] `src/types/project/index.ts` - Project composed types
- [ ] `src/types/components/config.ts` - Component config sub-types
- [ ] `tests/types/wizardState.type-test.ts` - Type compilation tests
- [ ] `tests/types/handlerContext.type-test.ts` - Context type tests
- [ ] `tests/types/project.type-test.ts` - Project type tests
- [ ] `tests/types/componentDefinition.type-test.ts` - Component type tests

### Modified Files

- [ ] `src/types/webview.ts` - Re-export composed WizardState
- [ ] `src/types/handlers.ts` - Re-export context variants
- [ ] `src/types/base.ts` - Re-export composed Project
- [ ] `src/types/components.ts` - Use config sub-types

## Implementation Details

### RED Phase (Write failing type tests)

```typescript
// tests/types/wizardState.type-test.ts
import { WizardState, WizardStepState, WizardSelections } from '@/types/wizard';

// Type-level test: ensure composition works
type AssertExtends<T, U> = T extends U ? true : false;

// WizardState should include all sub-types
type Test1 = AssertExtends<WizardState, WizardStepState>;
type Test2 = AssertExtends<WizardState, WizardSelections>;

// Property access should work
declare const state: WizardState;
const step: string = state.currentStep; // Should compile
const org = state.adobeOrg; // Should compile
```

### GREEN Phase (Define decomposed interfaces)

#### 1. WizardState Decomposition

```typescript
// src/types/wizard/index.ts

/** Core wizard navigation state */
export interface WizardStepState {
  currentStep: WizardStep;
  projectName: string;
  projectTemplate: ProjectTemplate;
  projectSearchFilter?: string;
}

/** User selections during wizard */
export interface WizardSelections {
  components?: ComponentSelection;
  componentConfigs?: ComponentConfigs;
  adobeAuth: AdobeAuthState;
  adobeOrg?: Organization;
  adobeProject?: AdobeProject;
  adobeWorkspace?: Workspace;
  commerceConfig?: WizardCommerceConfig;
}

/** Operation status tracking */
export interface WizardOperationStatus {
  creationProgress?: CreationProgress;
  apiVerification?: ApiVerificationState;
  apiMesh?: ApiMeshState;
}

/** Cached data (not serialized to disk) */
export interface WizardCache {
  projectsCache?: AdobeProject[];
  workspacesCache?: Workspace[];
  organizationsCache?: Organization[];
}

/** Full wizard state - composition of focused interfaces */
export type WizardState = WizardStepState & WizardSelections & WizardOperationStatus & WizardCache;
```

#### 2. HandlerContext Variants

```typescript
// src/types/handlers/contexts.ts

/** Base context available to all handlers */
export interface BaseHandlerContext {
  logger: Logger;
  debugLogger: Logger;
  context: vscode.ExtensionContext;
  stateManager: StateManager;
  sharedState: SharedState;
  sendMessage: (type: string, data?: unknown) => Promise<void>;
}

/** Context for authentication handlers */
export interface AuthHandlerContext extends BaseHandlerContext {
  authManager: AuthenticationService;
  communicationManager: WebviewCommunicationManager;
}

/** Context for prerequisite handlers */
export interface PrereqHandlerContext extends BaseHandlerContext {
  prereqManager: PrerequisitesManager;
  progressUnifier: ProgressUnifier;
  stepLogger: StepLogger;
  errorLogger: ErrorLogger;
}

/** Context for mesh handlers */
export interface MeshHandlerContext extends BaseHandlerContext {
  authManager: AuthenticationService;
  communicationManager: WebviewCommunicationManager;
}

/** Full context (backward compatible) */
export interface HandlerContext extends BaseHandlerContext {
  prereqManager?: PrerequisitesManager;
  authManager?: AuthenticationService;
  componentHandler?: IComponentHandler;
  errorLogger?: ErrorLogger;
  progressUnifier?: ProgressUnifier;
  stepLogger?: StepLogger;
  panel: vscode.WebviewPanel | undefined;
  communicationManager: WebviewCommunicationManager | undefined;
}
```

#### 3. Project Decomposition

```typescript
// src/types/project/index.ts

/** Core project identity */
export interface ProjectBase {
  name: string;
  template?: ProjectTemplate;
  created: Date;
  lastModified: Date;
  path: string;
  status: ProjectStatus;
  organization?: string;
  createdAt?: Date;  // Alias for compatibility
  updatedAt?: Date;  // Alias for compatibility
}

/** Adobe configuration */
export interface ProjectAdobeConfig {
  adobe?: AdobeConfig;
  commerce?: CommerceConfig;
}

/** Component state */
export interface ProjectComponentState {
  componentInstances?: Record<string, ComponentInstance>;
  componentSelections?: ComponentSelections;
  componentConfigs?: Record<string, Record<string, string | boolean | number | undefined>>;
  componentVersions?: Record<string, { version: string; lastUpdated: string }>;
}

/** Deployment state */
export interface ProjectDeploymentState {
  meshState?: MeshState;
  frontendEnvState?: FrontendEnvState;
}

/** Full project - composition */
export type Project = ProjectBase & ProjectAdobeConfig & ProjectComponentState & ProjectDeploymentState;
```

#### 4. RawComponentDefinition Sub-types

```typescript
// src/types/components/config.ts

/** Deployment-related configuration */
export interface ComponentDeploymentConfig {
  requiresDeployment?: boolean;
  deploymentTarget?: string;
  runtime?: string;
  actions?: string[];
}

/** UI-related configuration */
export interface ComponentUIConfig {
  impact?: 'minimal' | 'moderate' | 'significant';
  removable?: boolean;
  defaultEnabled?: boolean;
  position?: string;
  startOpen?: boolean;
}

/** Runtime configuration */
export interface ComponentRuntimeConfig {
  port?: number;
  nodeVersion?: string;
  buildScript?: string;
}

/** Service configuration */
export interface ComponentServiceConfig {
  requiredEnvVars?: string[];
  optionalEnvVars?: string[];
  requiredServices?: string[];
  services?: string[];
  providesEnvVars?: string[];
  providesEndpoint?: boolean;
}
```

### REFACTOR Phase

1. Update imports across codebase to use new paths
2. Add re-exports in original files for backward compatibility
3. Update JSDoc comments to reference sub-types
4. Remove redundant type assertions now that types are more specific

## Expected Outcome

- 15 new focused interface definitions
- WizardState: 4 composed interfaces (step, selections, operations, cache)
- HandlerContext: 4 variants (base, auth, prereq, mesh)
- Project: 4 composed interfaces (base, adobe, component, deployment)
- RawComponentDefinition: 4 config sub-types
- Zero runtime changes (types only)
- All existing code continues to compile

## Acceptance Criteria

- [ ] All type tests compile and pass
- [ ] Existing tests pass without modification
- [ ] No runtime behavior changes
- [ ] Backward compatibility maintained via re-exports
- [ ] TypeScript reports no new errors
- [ ] IDE IntelliSense shows focused type hints

## Estimated Time

2-3 hours

## Improvement Tracking

```
Step 7 Impact Summary:
- LOC: +100 (interface definitions), -0 (same runtime)
- CC Reduction: 0 (types only)
- Type Safety: +15 focused interfaces
- Abstractions: +15 type abstractions (justified by ISP)
- Coverage: type tests only
```

## Notes

- This is a **types-only** refactoring with zero runtime impact
- Use TypeScript's intersection types (`&`) for composition
- Maintain re-exports for backward compatibility
- Consider using `Pick<>` and `Omit<>` for derived types
- Type tests use compile-time assertions, not runtime tests
