# Step 4: Document Mock Derivation Guidelines

## Purpose

Document the established mock derivation patterns for future contributors, ensuring test mocks stay synchronized with actual JSON configuration files and preventing the v3.0.0 mock drift issue from recurring.

## Prerequisites

- [ ] Steps 1-3 complete (inventory, type-json-alignment extended, feature mocks verified)
- [ ] Understanding of testUtils pattern (50+ files in codebase)

## Tests to Write First (RED Phase)

### Documentation Validation

This is a documentation-only step. No code tests required.

**Validation criteria:**
- [ ] Guidelines section added to tests/README.md
- [ ] Header comment added to ComponentRegistryManager.testUtils.ts
- [ ] Examples reference actual file paths in codebase

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| Modify | `tests/README.md` | Add "Mock Derivation Guidelines" section |
| Modify | `tests/features/components/services/ComponentRegistryManager.testUtils.ts` | Add derivation header comment |

## Implementation Details (GREEN Phase)

### 1. Add section to tests/README.md

Insert after "Writing New Tests" section (~line 169):

```markdown
## Mock Derivation Guidelines

### Pattern: Derive Mocks from Actual JSON

Test mocks for JSON configuration files MUST be derived from actual file structure:

1. **Primary pattern**: Use `testUtils.ts` files for shared mock data
2. **Version alignment**: When JSON structure changes, update mocks immediately
3. **Drift detection**: `tests/templates/type-json-alignment.test.ts` catches misalignment

### Example: ComponentRegistryManager.testUtils.ts

```typescript
// v2.0 structure (unified 'components' map)
export const mockRawRegistry: RawComponentRegistry = { version: '2.0', components: {...} };

// v3.0.0 structure (separate top-level sections)
export const mockRawRegistryV3: RawComponentRegistry = { version: '3.0.0', frontends: {...}, backends: {...} };
```

### When to Update Mocks vs Actual Data

| Scenario | Action |
|----------|--------|
| JSON schema changes | Update mocks to match new structure |
| Tests fail after JSON update | Verify mock reflects actual structure |
| Adding new JSON field | Add field to both mock AND type-json-alignment.test.ts |

### Key Files

- `tests/templates/type-json-alignment.test.ts` - Catches JSON/type drift
- `tests/features/components/services/ComponentRegistryManager.testUtils.ts` - Example versioned mocks
```

### 2. Add header comment to ComponentRegistryManager.testUtils.ts

Expand existing header (lines 1-6):

```typescript
/**
 * Shared test utilities for ComponentRegistryManager tests
 *
 * MOCK DERIVATION PATTERN:
 * These mocks are derived from templates/components.json structure.
 * When components.json schema changes:
 * 1. Add new mock version (e.g., mockRawRegistryV4) matching new structure
 * 2. Update tests/templates/type-json-alignment.test.ts if new fields added
 * 3. Keep old mocks for backward compatibility testing
 *
 * See tests/README.md "Mock Derivation Guidelines" for full documentation.
 *
 * NOTE: Mock declarations must be in each test file (Jest hoisting requirement).
 * This file contains only shared test data and helper functions.
 */
```

## Expected Outcome

- [ ] Future contributors discover mock derivation pattern in tests/README.md
- [ ] ComponentRegistryManager.testUtils.ts explains version mock strategy
- [ ] No new infrastructure created - documentation only
- [ ] Pattern is searchable ("mock derivation", "testUtils")

## Acceptance Criteria

- [ ] Guidelines section added to tests/README.md (after line ~169)
- [ ] Header comment expanded in ComponentRegistryManager.testUtils.ts
- [ ] Examples reference actual file paths (not hypothetical)
- [ ] Documentation is concise (<100 lines added total)

## Estimated Time

30 minutes
