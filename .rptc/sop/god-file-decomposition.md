# God File Decomposition - Project-Specific SOP

**Version**: 1.1.0
**Last Updated**: 2026-01-03
**Priority**: Project-specific

---

## Overview

This SOP defines detection criteria, decomposition patterns, and refactoring workflows for "god files" - large files with multiple responsibilities that violate the Single Responsibility Principle. God files are maintenance hazards that make code harder to understand, test, and modify.

**Core Philosophy**: **Extract for Reuse, Section for Clarity**

Files should only be split when code is genuinely reused (2+ callers). For single-caller code, use section headers for organization rather than file extraction. Premature extraction creates artificial boundaries and increases cognitive overhead without benefit.

---

## 1. Detection Criteria

### Line Count Thresholds (by file type)

| File Type | Warning | Action Required | Notes |
|-----------|---------|-----------------|-------|
| **Service classes** (`.ts`) | >400 lines | >600 lines | Multiple entity domains or operations |
| **React components** (`.tsx`) | >300 lines | >450 lines | Mixed rendering, state, and logic |
| **Handler files** (`.ts`) | >500 lines | >800 lines | Section headers preferred over extraction |
| **Utility files** (`.ts`) | >250 lines | >400 lines | Only unrelated utilities grouped together |
| **Hook files** (`.ts`) | >150 lines | >250 lines | Should be single-purpose |

**Important**: Line count alone does NOT trigger extraction. Files can exceed thresholds if:
- All code relates to a single responsibility
- Code is organized with clear section headers
- Helper functions are only used by a single parent (no reuse)

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

### Pattern C: Section-Based Organization (Handler Files) ⭐ PREFERRED

**When to use**: Handler file has related logic that's only used by one caller (no reuse).

**Key Principle**: Extract for reuse, section for clarity. If helpers are only used by one handler, keep them in the same file with section headers.

**Structure**:
```
checkHandler.ts (500 lines)
├── // ─────────────────────────────────────────────────────────────────────────────
├── // TYPES
├── // ─────────────────────────────────────────────────────────────────────────────
├── interface NodePrerequisiteCheckResult { ... }
├── interface PerNodeVersionStatusResult { ... }
├──
├── // ─────────────────────────────────────────────────────────────────────────────
├── // NODE VERSION CHECKING
├── // ─────────────────────────────────────────────────────────────────────────────
├── function checkNodePrerequisite(...) { ... }
├──
├── // ─────────────────────────────────────────────────────────────────────────────
├── // PER-NODE-VERSION STATUS BUILDING
├── // ─────────────────────────────────────────────────────────────────────────────
├── function buildPerNodeVersionStatus(...) { ... }
├──
├── // ─────────────────────────────────────────────────────────────────────────────
├── // MAIN HANDLER
├── // ─────────────────────────────────────────────────────────────────────────────
└── export async function handleCheckPrerequisites(...) { ... }
```

**Benefits**:
- Single file = single context to understand
- No import/export ceremony for internal code
- Section headers provide visual navigation
- IDE "Go to Symbol" works for all functions
- Easier refactoring (no cross-file changes)

---

### Pattern D: Helper Extraction (Multi-Caller Reuse)

**When to use**: Helper functions are used by **2+ different callers** (actual reuse, not hypothetical).

**Structure**:
```
handlers/
├── shared.ts (~200 lines)             ← Shared helpers (2+ callers)
├── checkHandler.ts (~500 lines)       ← Uses shared + internal helpers
└── installHandler.ts (~400 lines)     ← Uses shared + internal helpers
```

**Implementation**:
```typescript
// ✅ shared.ts - ONLY for code with 2+ callers
// Used by: checkHandler.ts, continueHandler.ts, installHandler.ts
export function getNodeVersionMapping(context: HandlerContext): Record<string, string> { /* ... */ }
export function hasNodeVersions(mapping: Record<string, string>): boolean { /* ... */ }
export function areDependenciesInstalled(prereq: PrerequisiteDefinition, context: HandlerContext): boolean { /* ... */ }

// ❌ BAD: Single-caller helper extracted to shared
// Only used by checkHandler.ts - should stay in checkHandler.ts
export function buildPerNodeVersionStatus(...) { /* ... */ }  // Don't do this!
```

**Reuse Verification**:
Before extracting to a shared file, verify actual reuse:
```bash
# Count callers of a function
grep -rn "functionName" src/ --include="*.ts" | grep -v "export\|function\|//" | wc -l
```
- **0-1 callers**: Keep inline with section headers
- **2+ callers**: Extract to shared file

---

### Pattern E: Repository + Service Layer

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

### 4.1 Single-Caller Extraction ⚠️ MOST COMMON MISTAKE

**Problem**: Extracting code to a separate file when it has only one caller. This creates artificial boundaries, increases cognitive overhead, and provides no reuse benefit.

**Detection**:
```bash
# Find helpers with only 1 import
for f in src/**/*Helpers.ts; do
  imports=$(grep -rn "from '.*${f%.*}'" src/ --include="*.ts" | wc -l)
  echo "$f: $imports imports"
done
```

```typescript
// ❌ WRONG: Extracted helper with single caller
// checkHandlerHelpers.ts (200 lines)
export function checkNodePrerequisite(...) { /* only used by checkHandler.ts */ }
export function buildPerNodeVersionStatus(...) { /* only used by checkHandler.ts */ }

// checkHandler.ts
import { checkNodePrerequisite, buildPerNodeVersionStatus } from './checkHandlerHelpers';

// ✅ CORRECT: Keep in same file with section headers
// checkHandler.ts (500 lines)

// ─────────────────────────────────────────────────────────────────────────────
// NODE VERSION CHECKING
// ─────────────────────────────────────────────────────────────────────────────
function checkNodePrerequisite(...) { /* inline */ }

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BUILDING
// ─────────────────────────────────────────────────────────────────────────────
function buildPerNodeVersionStatus(...) { /* inline */ }

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────
export async function handleCheckPrerequisites(...) { /* uses above */ }
```

**Why This Matters**:
- **More files ≠ better organization** - files should represent reuse boundaries
- **Import ceremony adds noise** - imports/exports for single-caller code is pure overhead
- **Cross-file changes harder** - refactoring touches multiple files needlessly
- **Cognitive load increases** - reader must jump between files to understand flow

---

### 4.2 Premature Abstraction

**Problem**: Extracting code for hypothetical future reuse that never materializes.

```typescript
// ❌ Over-abstracted: Generic helper "for extensibility"
// formatters.ts
export function formatUserName(user: User): string { /* 30 lines */ }
// ^ Created because "we might format other things later"

// ✅ Keep inline until 2+ ACTUAL use cases exist
function formatUserName(user: User): string { /* inline */ }
```

### 4.3 Facade Accumulation

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

### 4.4 Shared State Coupling

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

### 4.5 Circular Dependencies

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
| **Section-Based** ⭐ | Handler with single-caller helpers | Single file with section headers |
| **Helper Extraction** | Helpers with **2+ callers** (actual reuse) | Shared file + consumers |
| **Repository + Service** | Mixed data access and business logic | Repository + Service layers |

**Golden Rule**: A god file should be split when it has multiple reasons to change. Each resulting file should have exactly one reason to change.

**Core Philosophy**: **Extract for Reuse, Section for Clarity**

- **Single caller?** → Keep inline with section headers (Pattern C)
- **2+ callers?** → Extract to shared file (Pattern D)
- **Different responsibilities?** → Split into specialized services (Pattern A)

**Decomposition Mantra**: Extract by reuse, not by size. Size is the symptom; lack of reuse is often the disease being misdiagnosed as needing extraction.
