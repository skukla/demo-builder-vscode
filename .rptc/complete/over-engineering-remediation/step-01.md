# Step 1: State Audit & Documentation

## Purpose

Audit all writes to `componentConfigs` vs `componentInstances` throughout the codebase to identify duplicate state storage patterns similar to the mesh endpoint bug (stored in 3 places - now fixed). Document the single-source-of-truth principle and create a remediation plan for identified violations.

**Why This Matters:** The mesh endpoint dual-storage bug revealed that inconsistent state across multiple storage locations causes hard-to-debug failures. This step prevents future occurrences by establishing clear ownership of each data field.

## Prerequisites

- [ ] Mesh endpoint single-source fix is complete (already done per research doc)
- [ ] Access to all 45 files that reference `componentConfigs` or `componentInstances`

## Tests to Write First (RED Phase)

This step is primarily an audit/documentation task. The "tests" are validation scripts that verify the audit is complete and accurate.

### Test Scenario 1: State Ownership Mapping Completeness

**Given:** An audit document exists at `docs/architecture/state-ownership.md`
**When:** The document is parsed
**Then:** Every field in `Project.componentInstances` and `Project.componentConfigs` has a documented owner

```typescript
// tests/core/state/stateOwnershipAudit.test.ts
describe('State Ownership Audit', () => {
  it('should document all componentInstance fields with single owner', () => {
    // Given: Load the state-ownership.md document
    // When: Parse field ownership table
    // Then: Each field appears exactly once with clear owner
  });
});
```

### Test Scenario 2: No Duplicate Writes Pattern

**Given:** A list of all files that write to `componentInstances` or `componentConfigs`
**When:** Each write is categorized by data field
**Then:** No data field is written from multiple locations for the same operation

```typescript
describe('Duplicate Write Detection', () => {
  it('should identify files that write to overlapping fields', () => {
    // Given: Static analysis results from audit
    // When: Check for duplicate field writes
    // Then: Report any fields written from 2+ locations
  });
});
```

### Test Scenario 3: Mesh Endpoint Single Source Verification

**Given:** The fixed mesh endpoint implementation
**When:** Searching for mesh endpoint writes
**Then:** Only `meshState.envVars` or single authorized location contains the endpoint

```typescript
describe('Mesh Endpoint Single Source', () => {
  it('should have mesh endpoint in exactly one location', async () => {
    // Given: Search results for MESH_ENDPOINT writes
    // When: Count unique storage locations
    // Then: Exactly 1 authoritative source exists
  });
});
```

## Files to Modify

- `docs/architecture/state-ownership.md` - Create new documentation (state field ownership map)

## Files to Create

- `docs/architecture/state-ownership.md` - State ownership documentation
- `tests/core/state/stateOwnershipAudit.test.ts` - Validation tests for audit completeness

## Implementation Details

### RED Phase

Write the audit validation tests first:

```typescript
// tests/core/state/stateOwnershipAudit.test.ts
import * as fs from 'fs';
import * as path from 'path';

describe('State Ownership Audit', () => {
  const AUDIT_DOC_PATH = 'docs/architecture/state-ownership.md';

  it('should have state ownership documentation', () => {
    expect(fs.existsSync(AUDIT_DOC_PATH)).toBe(true);
  });

  it('should document componentInstances field ownership', () => {
    const content = fs.readFileSync(AUDIT_DOC_PATH, 'utf-8');
    const requiredFields = ['endpoint', 'status', 'port', 'pid'];
    for (const field of requiredFields) {
      expect(content).toContain(field);
    }
  });

  it('should document componentConfigs field ownership', () => {
    const content = fs.readFileSync(AUDIT_DOC_PATH, 'utf-8');
    expect(content).toContain('componentConfigs');
    expect(content).toContain('Environment variables');
  });
});
```

### GREEN Phase

1. Run grep audit across 45 identified files
2. Categorize each file's writes by:
   - **Read-only** (just accessing state)
   - **Write** (modifying state)
   - **Field written** (which specific field)
3. Create `docs/architecture/state-ownership.md` with findings
4. Document remediation plan for any duplicate write patterns found

**Audit Command to Run:**
```bash
# Find all componentConfigs writes
grep -rn "componentConfigs\s*=" src/ --include="*.ts"
grep -rn "componentConfigs\[" src/ --include="*.ts"

# Find all componentInstances writes
grep -rn "componentInstances\s*=" src/ --include="*.ts"
grep -rn "componentInstances\[" src/ --include="*.ts"
```

### REFACTOR Phase

- Consolidate findings into actionable remediation items
- Link to specific steps (2-7) that will address identified issues
- Add to CLAUDE.md the single-source-of-truth principle

## Expected Outcome

After this step:
1. **Audit Document Created:** `docs/architecture/state-ownership.md` with complete field-by-file mapping
2. **Violations Identified:** List of duplicate write patterns with severity
3. **Principle Documented:** CLAUDE.md updated with single-source-of-truth guideline
4. **Remediation Plan:** Specific action items linked to steps 2-7

## Acceptance Criteria

- [x] All 45 files referencing `componentConfigs`/`componentInstances` audited
- [x] State ownership document created at `docs/architecture/state-ownership.md`
- [x] Each `Project` field has exactly one documented owner (write authority)
- [x] Any duplicate write patterns have remediation items created
- [x] CLAUDE.md updated with single-source-of-truth principle
- [x] Validation tests pass confirming audit completeness (17 tests)
- [x] No new runtime code changes (audit/doc only)

## Dependencies from Other Steps

None - this is the first step and establishes the foundation for subsequent remediation work.

## Key Files to Audit (from research)

**Primary State Files:**
- `src/types/base.ts` - Project type definition with overlapping fields
- `src/core/state/stateManager.ts` - Central state orchestrator
- `src/core/state/projectConfigWriter.ts` - Writes project config files
- `src/core/state/projectFileLoader.ts` - Loads project from disk
- `src/core/state/projectStateSync.ts` - Frontend state synchronization

**High-Risk Write Locations:**
- `src/features/project-creation/handlers/executor.ts` - Writes during project creation
- `src/features/mesh/commands/deployMesh.ts` - Writes mesh state
- `src/features/mesh/services/stalenessDetector.ts` - Reads/compares state
- `src/features/lifecycle/commands/startDemo.ts` - Updates running state
- `src/features/dashboard/handlers/dashboardHandlers.ts` - Updates from UI

## Estimated Time

2-3 hours (primarily grep analysis and documentation)
