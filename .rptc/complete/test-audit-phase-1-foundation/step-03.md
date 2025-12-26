# Step 3: Extend type-json-alignment for logging.json

## Purpose

Add type alignment tests for `logging.json` following the established pattern in `type-json-alignment.test.ts`. This ensures that the logging message templates remain synchronized with the `LoggingTemplates` TypeScript interface and that all template values use valid syntax.

**Why this matters:** The StepLogger system uses these templates for consistent, configuration-driven logging throughout the extension. If JSON fields drift from what the code expects, template lookups will silently fail or return undefined.

## Prerequisites

- [ ] Step 2 completed (prerequisites.json alignment tests added)
- [ ] Understanding of existing `type-json-alignment.test.ts` pattern
- [ ] VERIFY: LoggingTemplates interface exists in `src/core/logging/stepLogger.ts`
- [ ] VERIFY: LoggingTemplates has `operations` and `statuses` properties as Record<string, string>

## Reference Context

### LoggingTemplates Interface (Source of Truth)

From `src/core/logging/stepLogger.ts`:
```typescript
interface LoggingTemplates {
    operations: Record<string, string>;
    statuses: Record<string, string>;
    [key: string]: Record<string, string>;
}
```

### logging.json Structure

```json
{
  "operations": {
    "checking": "Checking {item}...",
    "fetching": "Fetching {item}...",
    ...
  },
  "statuses": {
    "found": "Found {count} {item}",
    "authenticated": "Authenticated: {organization}",
    ...
  }
}
```

## Tests to Write First (TDD - RED Phase)

### Test Group 1: Root Config Alignment

- [ ] **Test:** should have no unknown fields in root config
  - **Given:** logging.json loaded
  - **When:** root fields examined against allowed set `['operations', 'statuses']`
  - **Then:** no unknown fields detected (or test fails with actionable message)
  - **File:** `tests/templates/type-json-alignment.test.ts`

### Test Group 2: Operations Section Validation

- [ ] **Test:** should have only string values in operations section
  - **Given:** logging.json loaded
  - **When:** all values in `operations` section examined
  - **Then:** every value is of type `string`
  - **File:** `tests/templates/type-json-alignment.test.ts`

- [ ] **Test:** should have valid template syntax in operations section
  - **Given:** logging.json loaded
  - **When:** all values in `operations` section examined
  - **Then:** values are non-empty strings (template parameters like `{item}` are valid)
  - **File:** `tests/templates/type-json-alignment.test.ts`

### Test Group 3: Statuses Section Validation

- [ ] **Test:** should have only string values in statuses section
  - **Given:** logging.json loaded
  - **When:** all values in `statuses` section examined
  - **Then:** every value is of type `string`
  - **File:** `tests/templates/type-json-alignment.test.ts`

- [ ] **Test:** should have valid template syntax in statuses section
  - **Given:** logging.json loaded
  - **When:** all values in `statuses` section examined
  - **Then:** values are non-empty strings
  - **File:** `tests/templates/type-json-alignment.test.ts`

### Test Group 4: Aggregate Alignment Check

- [ ] **Test:** should pass all logging.json type/JSON alignment checks
  - **Given:** all individual tests pass
  - **When:** aggregate test runs
  - **Then:** single pass/fail for CI clarity
  - **File:** `tests/templates/type-json-alignment.test.ts`

## Files to Modify

- [ ] `tests/templates/type-json-alignment.test.ts` - Add logging.json alignment test suite

## Implementation Details

### RED Phase (Write failing tests first)

Add the following to `tests/templates/type-json-alignment.test.ts`:

**1. Add field set constant at the top with other field sets:**

```typescript
// ============================================================================
// Logging.json Field Sets
// From src/core/logging/stepLogger.ts - LoggingTemplates interface
// ============================================================================

/**
 * Root-level fields for logging.json
 * From LoggingTemplates interface: operations, statuses, [key: string] index signature
 * Note: Index signature allows extensibility, but current implementation only uses these two
 */
const LOGGING_ROOT_FIELDS = new Set([
    'operations',
    'statuses',
]);
```

**2. Add loggingConfig to beforeAll:**

```typescript
let loggingConfig: Record<string, unknown>;

beforeAll(() => {
    // ... existing file loads ...
    const loggingPath = path.join(__dirname, '../../templates/logging.json');
    loggingConfig = JSON.parse(fs.readFileSync(loggingPath, 'utf-8'));
});
```

**3. Add logging.json test suite:**

```typescript
// ========================================================================
// logging.json alignment
// ========================================================================

describe('logging.json <-> LoggingTemplates alignment', () => {
    it('should have no unknown fields in root config', () => {
        const unknown = findUnknownFields(loggingConfig, LOGGING_ROOT_FIELDS);
        if (unknown.length > 0) {
            fail(`logging.json root has unknown fields: ${unknown.join(', ')}. ` +
                 `Add to LoggingTemplates (src/core/logging/stepLogger.ts) or remove from JSON.`);
        }
    });

    it('should have only string values in operations section', () => {
        const operations = loggingConfig.operations as Record<string, unknown>;
        Object.entries(operations).forEach(([key, value]) => {
            if (typeof value !== 'string') {
                fail(`logging.json operations.${key} is not a string: found ${typeof value}. ` +
                     `All logging template values must be strings.`);
            }
        });
    });

    it('should have non-empty string values in operations section', () => {
        const operations = loggingConfig.operations as Record<string, unknown>;
        Object.entries(operations).forEach(([key, value]) => {
            if (typeof value === 'string' && value.trim() === '') {
                fail(`logging.json operations.${key} is empty. ` +
                     `Logging templates must contain message text.`);
            }
        });
    });

    it('should have only string values in statuses section', () => {
        const statuses = loggingConfig.statuses as Record<string, unknown>;
        Object.entries(statuses).forEach(([key, value]) => {
            if (typeof value !== 'string') {
                fail(`logging.json statuses.${key} is not a string: found ${typeof value}. ` +
                     `All logging template values must be strings.`);
            }
        });
    });

    it('should have non-empty string values in statuses section', () => {
        const statuses = loggingConfig.statuses as Record<string, unknown>;
        Object.entries(statuses).forEach(([key, value]) => {
            if (typeof value === 'string' && value.trim() === '') {
                fail(`logging.json statuses.${key} is empty. ` +
                     `Logging templates must contain message text.`);
            }
        });
    });

    it('should have operations section as an object', () => {
        expect(loggingConfig.operations).toBeDefined();
        expect(typeof loggingConfig.operations).toBe('object');
        expect(loggingConfig.operations).not.toBeNull();
    });

    it('should have statuses section as an object', () => {
        expect(loggingConfig.statuses).toBeDefined();
        expect(typeof loggingConfig.statuses).toBe('object');
        expect(loggingConfig.statuses).not.toBeNull();
    });
});
```

### GREEN Phase (Minimal implementation to pass tests)

The tests should pass against the current `logging.json` which already follows the `LoggingTemplates` interface correctly. If any tests fail:

1. Either the JSON has invalid structure (fix the JSON)
2. Or the test expectations are incorrect (adjust test based on actual interface)

### REFACTOR Phase (Improve while keeping tests green)

1. Ensure error messages are actionable and specific
2. Verify test names are descriptive
3. Consider adding optional validation for template placeholder syntax (e.g., `{item}` format) if needed

## Expected Outcome

After completing this step:

- Tests verify logging.json root structure matches LoggingTemplates interface
- Tests verify all template values are non-empty strings
- Tests verify operations and statuses sections are proper objects
- CI will catch any logging.json/TypeScript drift immediately
- Developers get clear error messages pointing to exact field and required action

**Tests passing:** 7 new tests (root fields, operations string, operations non-empty, statuses string, statuses non-empty, operations object, statuses object)

## Acceptance Criteria

- [ ] All new tests pass for logging.json alignment
- [ ] Field set constant `LOGGING_ROOT_FIELDS` added with comment referencing source interface
- [ ] loggingConfig loaded in beforeAll alongside other configs
- [ ] Test suite follows established pattern (describe block, clear test names, actionable fail messages)
- [ ] No changes to logging.json required (tests validate current structure)
- [ ] Coverage maintained at 80%+ for test file
- [ ] Error messages include:
  - Which file has the issue
  - Which field is problematic
  - Which TypeScript interface to check
  - Whether to add to interface or remove from JSON

## Estimated Time

1-2 hours (following established pattern, straightforward extension)

## Notes

- The `LoggingTemplates` interface has an index signature `[key: string]: Record<string, string>` which allows additional sections beyond `operations` and `statuses`. However, the current implementation only uses these two sections, so we validate against this practical usage rather than the permissive signature.
- Template syntax validation (checking for `{placeholder}` patterns) is not strictly required since the StepLogger handles missing placeholders gracefully. The tests focus on structural alignment.
- If future requirements add new root-level sections to logging.json, the test will fail and prompt developers to either add the section to `LOGGING_ROOT_FIELDS` or update the TypeScript interface.
