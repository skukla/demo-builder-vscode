# God File Decomposition - Project-Specific SOP

**Version**: 1.0.0
**Last Updated**: 2025-12-17
**Priority**: Project-specific

---

## Overview

This SOP defines detection criteria, decomposition patterns, and refactoring workflows for "god files" - large files with multiple responsibilities that violate the Single Responsibility Principle. God files are maintenance hazards that make code harder to understand, test, and modify.

---

## 1. Detection Criteria

### Line Count Thresholds (by file type)

| File Type | Warning | Action Required | Notes |
|-----------|---------|-----------------|-------|
| **Service classes** (`.ts`) | >300 lines | >400 lines | Multiple entity domains or operations |
| **React components** (`.tsx`) | >250 lines | >350 lines | Mixed rendering, state, and logic |
| **Handler files** (`.ts`) | >350 lines | >500 lines | After helper extraction |
| **Utility files** (`.ts`) | >200 lines | >300 lines | Too many unrelated utilities |
| **Hook files** (`.ts`) | >150 lines | >200 lines | Should be single-purpose |

### Coupling Indicators (beyond line count)

A file is a god file if it meets line threshold AND exhibits these symptoms:

| Indicator | Detection Pattern | Example |
|-----------|-------------------|---------|
| **Multiple entity domains** | Different noun groups in methods | `getOrgs()`, `getProjects()`, `getWorkspaces()` in same class |
| **Mixed responsibilities** | Actions at different abstraction levels | Data fetching + validation + caching + UI formatting |
| **High import count** | >15 imports (excluding types) | Many dependencies suggest multiple responsibilities |
| **Many public methods** | >10 public methods in a class | Each method group may be a separate service |
| **Inconsistent change reasons** | Different areas change for different features | Org methods change for auth features, project methods for dashboard |
| **Long constructor** | >7 injected dependencies | Each dependency may indicate a responsibility |
| **Duplicate patterns** | Same SDK/CLI fallback or similar 3+ times | Indicates extractable common patterns |

### Quick Detection Commands

```bash
# Files over threshold by type
find src -name "*.ts" -not -name "*.test.ts" -exec wc -l {} + | awk '$1 > 400 {print}'
find src -name "*.tsx" -not -name "*.test.tsx" -exec wc -l {} + | awk '$1 > 350 {print}'

# High import count
grep -l "^import" src/**/*.ts | xargs -I{} sh -c 'echo "$(grep -c "^import" {}) {}"' | awk '$1 > 15'

# Many public methods (classes)
grep -c "^\s*public\|^\s*async\s" src/**/*.ts | awk -F: '$2 > 10'
```

---

## 2. Decomposition Patterns

### Pattern A: Facade + Specialized Services (Service Classes)

**When to use**: Service class manages multiple entity domains or operation types.

**Structure**:
```
godService.ts (964 lines)
↓ Decompose to:
├── entityFetcher.ts (~300 lines)      ← Data fetching operations
├── entityResolver.ts (~250 lines)     ← Context/state resolution
├── entitySelector.ts (~350 lines)     ← Selection/mutation operations
└── entityService.ts (~150 lines)      ← Facade orchestrating above
```

**Implementation**:
```typescript
// ❌ BEFORE: God class with multiple responsibilities
class AdobeEntityService {
    getOrganizations() { /* fetch logic */ }
    getCurrentOrganization() { /* resolution logic */ }
    selectOrganization() { /* selection logic */ }
    getProjects() { /* fetch logic */ }
    getCurrentProject() { /* resolution logic */ }
    selectProject() { /* selection logic */ }
    // ... 30+ methods
}

// ✅ AFTER: Facade delegating to specialized services
class AdobeEntityService {
    constructor(
        private fetcher: AdobeEntityFetcher,
        private resolver: AdobeContextResolver,
        private selector: AdobeEntitySelector,
    ) {}

    // Thin delegation methods
    getOrganizations() { return this.fetcher.getOrganizations(); }
    getCurrentOrganization() { return this.resolver.getCurrentOrganization(); }
    selectOrganization(id: string) { return this.selector.selectOrganization(id); }
}
```

**Benefits**:
- Backward-compatible API (facade maintains original interface)
- Each service testable in isolation
- Clear separation of concerns
- Gradual consumer migration possible

---

### Pattern B: Custom Hook Extraction (React Components)

**When to use**: Component has 100+ lines of state management or business logic.

**Structure**:
```
GodComponent.tsx (737 lines)
↓ Decompose to:
├── hooks/
│   ├── useComponentNavigation.ts (~150 lines)
│   ├── useComponentState.ts (~200 lines)
│   └── useComponentPersistence.ts (~100 lines)
├── components/
│   └── ComponentStepRenderer.tsx (~80 lines)
└── GodComponent.tsx (~200 lines)  ← Thin orchestrator
```

**Implementation**:
```typescript
// ❌ BEFORE: Component with mixed concerns
function WizardContainer() {
    // 50 lines of navigation state
    const [currentStep, setCurrentStep] = useState('');
    const [enabledSteps, setEnabledSteps] = useState([]);
    // ... navigation handlers

    // 100 lines of wizard state
    const [formData, setFormData] = useState({});
    const [selections, setSelections] = useState({});
    // ... state handlers

    // 200 lines of step rendering switch
    switch (currentStep) {
        case 'step1': return <Step1 />;
        case 'step2': return <Step2 />;
        // ... many cases
    }
}

// ✅ AFTER: Thin orchestrator with extracted hooks
function WizardContainer() {
    const navigation = useWizardNavigation(enabledSteps);
    const state = useWizardState(importedSettings);
    const persistence = useWizardPersistence(state);

    return (
        <WizardLayout>
            <TimelineNav steps={navigation.steps} />
            <WizardStepRenderer
                step={navigation.currentStep}
                state={state}
                onUpdate={persistence.save}
            />
            <WizardFooter navigation={navigation} />
        </WizardLayout>
    );
}
```

---

### Pattern C: Helper Extraction (Handler Files)

**When to use**: Handler file has shared logic, type guards, or utility functions.

**Structure**:
```
godHandlers.ts (784 lines)
↓ Decompose to:
├── godHelpers.ts (~200 lines)         ← Pure helper functions
├── godTypeGuards.ts (~50 lines)       ← Type guard functions
└── godHandlers.ts (~500 lines)        ← Message handlers only
```

**Implementation**:
```typescript
// ❌ BEFORE: Handlers mixed with helpers
// godHandlers.ts
function hasAdobeWorkspaceContext(data: unknown): data is WithWorkspace { /* ... */ }
function buildStatusPayload(project: Project): StatusPayload { /* ... */ }
function determineMeshStatus(record: MeshRecord): MeshStatus { /* ... */ }

export function handleRequestStatus(context: HandlerContext) {
    // Uses above helpers
}

// ✅ AFTER: Separated helpers
// godHelpers.ts
export function buildStatusPayload(project: Project): StatusPayload { /* ... */ }
export function determineMeshStatus(record: MeshRecord): MeshStatus { /* ... */ }

// godTypeGuards.ts
export function hasAdobeWorkspaceContext(data: unknown): data is WithWorkspace { /* ... */ }

// godHandlers.ts
import { buildStatusPayload, determineMeshStatus } from './godHelpers';
import { hasAdobeWorkspaceContext } from './godTypeGuards';

export function handleRequestStatus(context: HandlerContext) { /* ... */ }
```

---

### Pattern D: Repository + Service Layer

**When to use**: Service mixes data fetching (API/CLI calls) with business logic.

**Structure**:
```
godService.ts (600 lines)
↓ Decompose to:
├── entityRepository.ts (~200 lines)   ← Data access only
└── entityService.ts (~250 lines)      ← Business logic only
```

**Implementation**:
```typescript
// ❌ BEFORE: Mixed data access and business logic
class UserService {
    async getActiveUsers(): Promise<User[]> {
        // Data fetching
        const response = await this.sdk.getUsers();
        const users = response.body.map(this.mapUser);

        // Business logic
        return users.filter(u => u.isActive && !u.isDeleted);
    }
}

// ✅ AFTER: Separated layers
class UserRepository {
    async findAll(): Promise<User[]> {
        const response = await this.sdk.getUsers();
        return response.body.map(this.mapUser);
    }
}

class UserService {
    constructor(private repo: UserRepository) {}

    async getActiveUsers(): Promise<User[]> {
        const users = await this.repo.findAll();
        return users.filter(u => u.isActive && !u.isDeleted);
    }
}
```

---

## 3. Decomposition Workflow

### Step 1: Identify Responsibility Groups

1. List all public methods/exports
2. Group by noun (entity domain) or verb (operation type)
3. Identify shared dependencies between groups
4. Draw dependency graph

**Example Analysis**:
```
AdobeEntityService (964 lines)
├── Organization methods (12 methods)
│   ├── Fetching: getOrganizations()
│   ├── Resolution: getCurrentOrganization()
│   └── Selection: selectOrganization(), autoSelectOrganizationIfNeeded()
├── Project methods (8 methods)
│   └── Similar pattern...
└── Workspace methods (6 methods)
    └── Similar pattern...

Grouping by operation type:
├── Fetching (getOrganizations, getProjects, getWorkspaces)
├── Resolution (getCurrentOrganization, getCurrentProject, etc.)
└── Selection (selectOrganization, selectProject, etc.)
```

### Step 2: Design Extraction

1. Choose decomposition pattern based on file type
2. Define interfaces for extracted units
3. Plan dependency injection order
4. Identify cross-cutting concerns (callbacks, events)

**Dependency Order Rule**: Extract leaf dependencies first (no other internal deps), then dependents.

```
Correct order:
1. EntityFetcher (no internal deps) ← First
2. EntityResolver (depends on Fetcher)
3. EntitySelector (depends on Fetcher + Resolver)
4. EntityService facade (composes all) ← Last
```

### Step 3: Create Extracted Units with Tests

1. Create new file with extracted methods
2. Write unit tests for extracted unit
3. Verify tests pass in isolation
4. Do NOT modify original file yet

```bash
# TDD for extracted unit
npm run test:file -- tests/features/auth/services/entityFetcher.test.ts
```

### Step 4: Integrate via Facade

1. Update original file to import and delegate to extracted units
2. Maintain original public API for backward compatibility
3. Run full test suite to verify no regressions

```bash
# Full feature test suite
npm test -- --selectProjects node --testPathPatterns="features/auth"
```

### Step 5: Gradual Consumer Migration (Optional)

1. Identify consumers of the facade
2. Update consumers to use specialized services directly
3. Remove delegation methods from facade when all migrated
4. Eventually remove facade entirely

---

## 4. Anti-Patterns to Avoid

### 4.1 Premature Extraction

**Problem**: Extracting code that has only one use case.

```typescript
// ❌ Over-extracted: 30-line helper used once
// userNameFormatter.ts
export function formatUserName(user: User): string { /* 30 lines */ }

// ✅ Keep inline until 2+ use cases exist
function formatUserName(user: User): string { /* inline */ }
```

### 4.2 Facade Accumulation

**Problem**: Facade grows new methods instead of delegating.

```typescript
// ❌ Bad: New methods added to facade
class EntityService {
    // Original delegations
    getOrganizations() { return this.fetcher.getOrganizations(); }

    // NEW method added to facade instead of appropriate service
    validateOrgPermissions() { /* Should be in selector or validator */ }
}

// ✅ Good: New functionality goes to appropriate specialized service
class EntitySelector {
    validateOrgPermissions() { /* Belongs here */ }
}
```

### 4.3 Shared State Coupling

**Problem**: Extracted services share internal state.

```typescript
// ❌ Bad: Shared mutable state
class EntityFetcher {
    private cachedOrgs: Org[] = [];  // Shared state
}

class EntitySelector {
    constructor(private fetcher: EntityFetcher) {
        // Directly accesses fetcher.cachedOrgs - tight coupling
    }
}

// ✅ Good: State managed by dedicated cache manager
class EntityFetcher {
    constructor(private cache: CacheManager) {}

    async getOrganizations() {
        return this.cache.getOrSet('orgs', () => this.fetchOrgs());
    }
}
```

### 4.4 Circular Dependencies

**Problem**: Extracted units depend on each other cyclically.

```typescript
// ❌ Bad: A depends on B, B depends on A
class ServiceA {
    constructor(private serviceB: ServiceB) {}
}

class ServiceB {
    constructor(private serviceA: ServiceA) {}  // Circular!
}

// ✅ Good: Use callbacks or events for cross-cutting concerns
class ServiceA {
    constructor(private onEvent: () => void) {}
}

class ServiceB {
    constructor() {}
    clearContext() { /* ... */ }
}

// Composition root wires the callback
const serviceB = new ServiceB();
const serviceA = new ServiceA(() => serviceB.clearContext());
```

---

## 5. Testing Strategy

### Unit Tests for Extracted Services

Each extracted service should have its own test file with isolated tests.

```typescript
// entityFetcher.test.ts
describe('EntityFetcher', () => {
    let fetcher: EntityFetcher;
    let mockSDK: jest.Mocked<SDK>;
    let mockCache: jest.Mocked<CacheManager>;

    beforeEach(() => {
        mockSDK = createMockSDK();
        mockCache = createMockCache();
        fetcher = new EntityFetcher(mockSDK, mockCache);
    });

    describe('getOrganizations()', () => {
        it('should return cached orgs if available', async () => {
            mockCache.get.mockReturnValue([{ id: 'org1' }]);
            const result = await fetcher.getOrganizations();
            expect(result).toEqual([{ id: 'org1' }]);
            expect(mockSDK.getOrgs).not.toHaveBeenCalled();
        });

        it('should fetch from SDK when cache empty', async () => {
            mockCache.get.mockReturnValue(undefined);
            mockSDK.getOrgs.mockResolvedValue({ body: [{ id: 'org1' }] });
            const result = await fetcher.getOrganizations();
            expect(mockSDK.getOrgs).toHaveBeenCalled();
        });
    });
});
```

### Integration Tests for Facade

Verify the facade correctly delegates to services.

```typescript
// entityService.integration.test.ts
describe('EntityService (Integration)', () => {
    it('should delegate getOrganizations to fetcher', async () => {
        const mockFetcher = { getOrganizations: jest.fn().mockResolvedValue([]) };
        const service = new EntityService(mockFetcher, mockResolver, mockSelector);

        await service.getOrganizations();

        expect(mockFetcher.getOrganizations).toHaveBeenCalled();
    });
});
```

### Regression Test: Original API

Ensure original consumers still work.

```bash
# Run full test suite for the feature
npm test -- --selectProjects node --testPathPatterns="features/authentication"
```

---

## 6. Checklist

### Before Decomposition

- [ ] File exceeds line threshold for its type
- [ ] File exhibits coupling indicators (multiple domains, many imports)
- [ ] Tests exist for current functionality
- [ ] Responsibility groups identified
- [ ] Decomposition pattern chosen
- [ ] Dependency order planned

### During Decomposition

- [ ] Extract leaf dependencies first
- [ ] Write tests for each extracted unit
- [ ] Verify extracted unit tests pass
- [ ] Create facade delegating to extracted units
- [ ] Run full test suite after each extraction
- [ ] Maintain original public API

### After Decomposition

- [ ] All tests pass
- [ ] No new ESLint errors
- [ ] Original file under threshold
- [ ] Each extracted file has single responsibility
- [ ] Documentation updated
- [ ] No circular dependencies

---

## 7. Summary

| Pattern | When to Use | Resulting Structure |
|---------|-------------|---------------------|
| **Facade + Services** | Service with multiple entity domains | Facade + 2-4 specialized services |
| **Hook Extraction** | Component with 100+ lines of logic | Thin component + 2-3 custom hooks |
| **Helper Extraction** | Handler with shared utilities | Handlers + helpers file |
| **Repository + Service** | Mixed data access and business logic | Repository + Service layers |

**Golden Rule**: A god file should be split when it has multiple reasons to change. Each resulting file should have exactly one reason to change.

**Decomposition Mantra**: Extract by responsibility, not by size. Size is the symptom; mixed responsibilities are the disease.
