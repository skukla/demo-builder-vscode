# Step 2: Integration Assessment

## Current Status

✅ **Abstractions Created (GREEN phase complete)**
- 50 tests passing
- All new utilities work in isolation
- TypeScript compiles successfully

❌ **Integration Missing (REFACTOR phase incomplete)**
- Existing code still uses old patterns
- No duplications eliminated
- No cognitive complexity reduction

---

## Integration Plan

### Part A: Mesh Helpers Integration

#### A.1: checkHandler.ts Integration

**Location**: `src/features/mesh/handlers/checkHandler.ts`

**Current Code** (Lines 206-249):
```typescript
const meshStatus = meshData.meshStatus?.toLowerCase();

if (meshStatus === 'deployed' || meshStatus === 'success') {
    // ... handle deployed
} else if (meshStatus === 'error' || meshStatus === 'failed') {
    // ... handle error
} else {
    // ... handle pending
}
```

**Required Changes**:
1. Import `getMeshStatusCategory` from `@/features/mesh/utils/meshHelpers`
2. Replace inline status checks with helper function
3. Use category-based control flow

**Expected Impact**:
- CC reduction: ~3 points (removes nested conditionals)
- LOC reduction: ~4 lines

#### A.2: createHandler.ts Integration

**Location**: `src/features/mesh/handlers/createHandler.ts`

**Current Code** (Lines 291-310):
```typescript
if (meshStatus === 'deployed' || meshStatus === 'success') {
    // ... deployed logic
} else if (meshStatus === 'error' || meshStatus === 'failed') {
    // ... error logic
}
```

**Required Changes**:
1. Import `getMeshStatusCategory`
2. Replace duplicate status categorization
3. Update control flow

**Expected Impact**:
- CC reduction: ~3 points
- LOC reduction: ~4 lines

#### A.3: Dashboard Integration (OPTIONAL)

**Finding**: Dashboard handlers use component.status, not raw mesh status strings.
**Decision**: DEFER - Different pattern, not covered by this step's scope.

---

### Part B: Canonical Abstractions Integration

#### B.1: AbstractCacheManager

**Current Implementations**:
1. `src/features/authentication/services/authCacheManager.ts`
2. `src/features/prerequisites/services/prerequisitesCacheManager.ts`

**Required Changes**:
1. Refactor both to extend `AbstractCacheManager<K, V>`
2. Remove duplicate TTL + jitter logic
3. Update tests to verify inheritance

**Expected Impact**:
- LOC reduction: ~80 lines (duplicate logic removal)
- Complexity: Consolidated to base class

#### B.2: ErrorFormatter

**Current Implementations**:
1. `src/features/mesh/utils/errorFormatter.ts` (functional approach)
2. `src/features/authentication/services/authenticationErrorFormatter.ts` (static class)

**Required Changes**:
1. Replace both with `ErrorFormatter` instances
2. Define pattern configs for each use case
3. Update all call sites

**Expected Impact**:
- LOC reduction: ~40 lines
- Pattern consistency: Unified approach

#### B.3: HandlerRegistry

**Current Implementations**:
1. `src/commands/handlers/HandlerRegistry.ts` (Map-based)
2. `src/features/project-creation/handlers/HandlerRegistry.ts` (BaseHandlerRegistry)

**Required Changes**:
1. Replace both with canonical `HandlerRegistry<TContext>`
2. Update all registrations
3. Migrate tests

**Expected Impact**:
- LOC reduction: ~60 lines
- Single pattern across codebase

#### B.4: Validators

**Current Implementations** (scattered):
1. `src/core/validation/fieldValidation.ts`
2. `src/features/project-creation/helpers/index.ts` (validation functions)
3. `src/features/authentication/services/organizationValidator.ts`

**Required Changes**:
1. Migrate to canonical `Validators.required()`, `.url()`, etc.
2. Replace custom validation with composition
3. Update tests

**Expected Impact**:
- LOC reduction: ~50 lines
- Composition pattern established

---

## Execution Strategy

### Phase 1: Low-Risk Quick Wins
1. **A.1 & A.2**: Mesh helpers (isolated, well-tested)
2. Run tests to verify no regressions

### Phase 2: Medium-Risk Refactoring
3. **B.1**: Cache managers (isolated services)
4. **B.2**: Error formatters (well-defined interfaces)
5. Run full test suite

### Phase 3: High-Risk Consolidation
6. **B.3**: Handler registries (core infrastructure)
7. **B.4**: Validators (widely used)
8. Comprehensive testing

### Phase 4: Verification
9. Run full test suite (all 360+ tests)
10. Build verification
11. Manual smoke testing

---

## Risk Assessment

| Integration | Risk | Reason | Mitigation |
|-------------|------|--------|------------|
| Mesh helpers | LOW | Isolated handlers, clear boundaries | Incremental with tests |
| Cache managers | MEDIUM | Service dependencies | Verify consumers unchanged |
| Error formatters | MEDIUM | Multiple call sites | Pattern-by-pattern migration |
| Handler registries | HIGH | Core infrastructure | Feature flag or gradual rollout |
| Validators | HIGH | Widely used | Thorough test coverage first |

---

## Rollback Plan

If any integration causes failures:
1. Revert specific file changes (git checkout)
2. Re-run tests to verify revert successful
3. Document failure reason
4. Adjust approach before retry

---

## Expected Final State

**After Full Integration**:
- ✅ 50+ tests passing (no regressions)
- ✅ All mesh handlers use helpers
- ✅ 2 cache managers extend AbstractCacheManager
- ✅ 2 error formatters use ErrorFormatter
- ✅ 1 HandlerRegistry pattern (instead of 2)
- ✅ Canonical validation throughout
- ✅ LOC reduction: ~200 lines
- ✅ CC reduction: ~20 points
- ✅ Duplications eliminated: 4 patterns

---

**Status**: Assessment complete, ready for execution
