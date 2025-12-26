# Step 2: Extract Deep Optional Chains to Accessor Functions

## Purpose

Fix deep optional chaining violations (>2 levels) per SOP code-patterns.md Section 4. Deep optional chains like `project.commerce?.services.catalog?.apiKey` require mental parsing and obscure intent. Extracting to named accessor functions improves readability and enables reuse.

## Prerequisites

- [ ] Step 1 completed (or can be done in parallel)
- [ ] Familiarity with `.rptc/sop/code-patterns.md` Section 4

## Files to Modify

### Primary Violations

1. **`src/core/state/projectConfigWriter.ts`** (lines 112-113)
   - `project.commerce?.services.catalog?.apiKey` (3 levels)
   - `project.commerce?.services.liveSearch?.apiKey` (3 levels)

2. **`src/features/dashboard/ui/configure/hooks/useSelectedComponents.ts`** (lines 48-49, 61-62, 85-86)
   - `dep.configuration?.requiredEnvVars?.length` (3 levels)
   - `dep.configuration?.optionalEnvVars?.length` (3 levels)

3. **`src/features/dashboard/ui/configure/ConfigureScreen.tsx`** (lines 171-172)
   - Duplicate of useSelectedComponents patterns

4. **`src/features/dashboard/ui/configure/configureHelpers.tsx`** (lines 110-111)
   - Duplicate of useSelectedComponents patterns

## Tests to Write First (RED Phase)

### Unit Tests: Accessor Functions

- [ ] **Test**: `getCommerceServiceApiKey` returns catalog API key when present
  - **Given**: Project with commerce.services.catalog.apiKey defined
  - **When**: `getCatalogApiKey(project)` called
  - **Then**: Returns the API key string
  - **File**: `tests/core/state/projectConfigWriter.test.ts`

- [ ] **Test**: `getCommerceServiceApiKey` returns empty string when path missing
  - **Given**: Project with undefined commerce
  - **When**: `getCatalogApiKey(project)` called
  - **Then**: Returns empty string
  - **File**: `tests/core/state/projectConfigWriter.test.ts`

- [ ] **Test**: `hasComponentEnvVars` returns true when required vars present
  - **Given**: ComponentDef with requiredEnvVars array
  - **When**: `hasComponentEnvVars(componentDef)` called
  - **Then**: Returns true
  - **File**: `tests/features/dashboard/ui/configure/configureHelpers.test.ts`

- [ ] **Test**: `hasComponentEnvVars` returns false when no env vars
  - **Given**: ComponentDef with empty/undefined configuration
  - **When**: `hasComponentEnvVars(componentDef)` called
  - **Then**: Returns false
  - **File**: `tests/features/dashboard/ui/configure/configureHelpers.test.ts`

## Implementation Details (GREEN Phase)

### 1. Create accessor functions in projectConfigWriter.ts

```typescript
// SOP Section 4: Extract deep optional chains to named accessors
function getCatalogApiKey(project: Project): string {
    return project.commerce?.services?.catalog?.apiKey || '';
}

function getLiveSearchApiKey(project: Project): string {
    return project.commerce?.services?.liveSearch?.apiKey || '';
}
```

### 2. Create/update shared helper in configureHelpers.tsx

```typescript
/**
 * Check if component definition has any environment variables configured
 * SOP Section 4: Extracts deep optional chain for env var checking
 */
export function hasComponentEnvVars(componentDef: ComponentDef | undefined): boolean {
    if (!componentDef?.configuration) return false;
    const required = componentDef.configuration.requiredEnvVars?.length || 0;
    const optional = componentDef.configuration.optionalEnvVars?.length || 0;
    return required > 0 || optional > 0;
}
```

### 3. Update call sites to use new helpers

Replace inline chains with function calls across all affected files.

## REFACTOR Phase

- Remove duplicate `hasComponentEnvVars` implementations if any exist
- Ensure consistent naming (`get*` for values, `has*` for booleans)
- Add JSDoc comments explaining the extracted chain

## Expected Outcome

- [ ] All deep optional chains (>2 levels) extracted to named functions
- [ ] Functions co-located with usage (file-level) or in shared helpers
- [ ] Improved code readability - intent clear from function names
- [ ] No behavior changes - pure refactoring

## Acceptance Criteria

- [ ] All tests passing for accessor functions
- [ ] No `?.` chains longer than 2 levels remain in modified files
- [ ] SOP Section 4 compliance verified via grep check
- [ ] Coverage maintained at 80%+ for modified code

## Verification Command

```bash
# Check for remaining violations in modified files
grep -E "\?\.[^?.]+\?\.[^?.]+\?\." src/core/state/projectConfigWriter.ts src/features/dashboard/ui/configure/*.ts*
```

## Estimated Time

1-2 hours

---

_Step 2 of 11 - Phase 1: Quick Wins_
