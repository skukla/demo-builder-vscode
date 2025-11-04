# ADR-001: Component Naming Standardization (externalSystems → integrations)

**Status**: Accepted and Implemented
**Date**: 2025-11-04
**Decision Maker**: Project Team
**Implementer**: RPTC Workflow

---

## Context

### The Problem

Prior to this change, there was a naming inconsistency between the JSON configuration layer and the TypeScript implementation:

**JSON Layer** (`templates/components.json`):
```json
{
  "selectionGroups": {
    "frontends": ["citisignal-nextjs"],
    "backends": ["adobe-commerce-paas"],
    "integrations": ["experience-platform"]
  }
}
```

**TypeScript Layer** (`src/types/components.ts`):
```typescript
interface ComponentRegistry {
    components: {
        frontends: TransformedComponentDefinition[];
        backends: TransformedComponentDefinition[];
        externalSystems: TransformedComponentDefinition[];  // ← Inconsistent!
    };
}
```

### Impact of Inconsistency

1. **Cognitive Load**: Developers had to mentally translate between "integrations" (JSON) and "externalSystems" (code)
2. **Discoverability**: Searching for "integrations" missed code usage; searching "externalSystems" missed JSON config
3. **Potential for Bugs**: Easy to use wrong property name when working across layers
4. **Documentation Complexity**: Had to explain the mapping in multiple places

### Options Considered

#### Option 1: Standardize on "integrations" ✅ SELECTED
- **Pros**: Matches JSON source of truth, aligns with business terminology, least disruptive
- **Cons**: Slightly less descriptive than "externalSystems"

#### Option 2: Standardize on "externalSystems" ❌ REJECTED
- **Pros**: More technically descriptive
- **Cons**: Requires JSON schema change, breaks from Adobe terminology, higher risk

#### Option 3: Keep Current Mapping ❌ REJECTED
- **Pros**: No changes required
- **Cons**: Maintains confusion, doesn't solve cognitive load problem

---

## Decision

**We standardized on "integrations" throughout the codebase**, replacing all instances of "externalSystems" with "integrations".

### Rationale

1. **JSON is Source of Truth**: Configuration drives behavior, code should follow
2. **User-Facing Alignment**: Matches product terminology users understand
3. **Least Disruptive**: No JSON schema changes, no backward compatibility issues
4. **Adobe Ecosystem Consistency**: Aligns with Adobe Experience Cloud terminology

### Trade-offs Accepted

- Technical precision ("externalSystems") traded for business alignment ("integrations")
- May need future clarification if other integration types emerge (App Builder integrations, etc.)

---

## Implementation

### Scope

**26 files modified** across type definitions, services, handlers, UI components, and tests:

#### Type Definitions (5 files)
- `src/types/base.ts`
- `src/types/components.ts` (core interface change)
- `src/types/messages.ts`
- `webview-ui/src/shared/types/index.ts`
- `webview-ui/src/shared/types/index.d.ts`

#### Service Layer (1 file)
- `src/features/components/services/ComponentRegistryManager.ts` (transformation logic)

#### Handlers & Commands (4 files)
- `src/features/components/handlers/componentHandlers.ts`
- `src/commands/configureProjectWebview.ts`
- `src/features/dashboard/commands/configure.ts`
- `src/features/project-creation/handlers/executor.ts`

#### Backend UI Components (5 files)
- `src/features/components/ui/steps/ComponentSelectionStep.tsx`
- `src/features/components/ui/steps/ComponentConfigStep.tsx`
- `src/features/dashboard/ui/ConfigureScreen.tsx`
- `src/features/project-creation/ui/wizard/WizardContainer.tsx`
- `src/features/project-creation/ui/steps/ReviewStep.tsx`

#### Webview UI Components (5 files)
- `webview-ui/src/wizard/components/WizardContainer.tsx`
- `webview-ui/src/wizard/steps/ComponentSelectionStep.tsx`
- `webview-ui/src/wizard/steps/ComponentConfigStep.tsx`
- `webview-ui/src/wizard/steps/ReviewStep.tsx`
- `webview-ui/src/configure/ConfigureScreen.tsx`

#### Prerequisites Handler (1 file)
- `src/features/prerequisites/handlers/shared.ts`

#### Test Files (5 files)
- `tests/features/prerequisites/handlers/checkHandler.test.ts`
- `tests/features/prerequisites/handlers/shared.test.ts`
- `tests/features/components/ui/steps/ComponentSelectionStep.test.tsx`
- `tests/features/components/ui/steps/ComponentConfigStep.test.tsx`
- `tests/features/components/handlers/componentHandlers.test.ts`

### Replacement Pattern

**Before**:
```typescript
interface ComponentRegistry {
    components: {
        externalSystems: TransformedComponentDefinition[];
    };
}

const [selectedExternalSystems, setSelectedExternalSystems] = useState<Set<string>>();
```

**After**:
```typescript
interface ComponentRegistry {
    components: {
        integrations: TransformedComponentDefinition[];
    };
}

const [selectedIntegrations, setSelectedIntegrations] = useState<Set<string>>();
```

### Implementation Method

- Used bulk replacement script (`sed`) to ensure consistency
- Replaced both variations: `externalSystems` → `integrations` and `ExternalSystems` → `Integrations`
- Verified zero remaining occurrences in production code

---

## Verification

### Success Criteria: ALL MET ✅

- ✅ **Consistent naming**: JSON → Types → Code → UI all use "integrations"
- ✅ **No remaining references**: 0 occurrences of "externalSystems" in production code
- ✅ **All tests pass**: 90/90 test suites passing (100% pass rate)
- ✅ **No regressions**: 0 TypeScript compilation errors
- ✅ **Documentation updated**: ADR created, plan archived

### Testing Results

```
Test Suites: 90 passed, 90 total
Tests:       2035 passed, 9 skipped, 2044 total
TypeScript:  0 compilation errors
Remaining:   0 "externalSystems" references in code
```

---

## Consequences

### Positive

1. **Single Source of Truth**: "integrations" used consistently throughout stack
2. **Reduced Cognitive Load**: No mental translation between layers required
3. **Better Discoverability**: Single term to search across codebase
4. **Aligned with Business**: Matches Adobe terminology and product language
5. **No Breaking Changes**: Internal refactoring only, no external API changes

### Neutral

1. **26 Files Modified**: Large change, but mechanical and low-risk
2. **Git History**: Some blame complexity for renamed code sections

### Negative

None identified. Change was purely positive from consistency and clarity perspective.

---

## References

- **Plan**: `.rptc/complete/standardize-component-naming/overview.md`
- **Related Components**:
  - `templates/components.json` - JSON source of truth
  - `src/types/components.ts` - Core type definitions
  - `src/features/components/services/ComponentRegistryManager.ts` - Transformation logic
- **Related ADRs**: None (first ADR)

---

## Migration Guide

For developers working on branches created before this change:

**Before** (deprecated):
```typescript
const systems = registry.components.externalSystems;
const [selectedExternalSystems, setSelectedExternalSystems] = useState();
```

**After** (current):
```typescript
const systems = registry.components.integrations;
const [selectedIntegrations, setSelectedIntegrations] = useState();
```

**Merge Strategy**: This change affects many files. When merging branches:
1. Update your branch to use "integrations" terminology
2. Search for "externalSystems" in your branch: `git grep externalSystems`
3. Replace with "integrations" in your code
4. Run tests to verify: `npm test`
