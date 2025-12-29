# Step 1: Create demo-packages.json and schema

## Purpose

Merge `brands.json` (3 brands) and `templates.json` (5 templates) into a unified `demo-packages.json` structure. This eliminates the indirection where templates reference brands by ID, embedding brand data directly into each package for clearer, self-contained definitions.

## Prerequisites

- [x] Understand current brands.json structure (id, configDefaults, contentSources)
- [x] Understand current templates.json structure (stack, brand reference, source)

## Tests to Write First (TDD)

- [x] Test: demo-packages.json validates against schema
- [x] Test: 2 packages with 5 storefronts total (nested structure)
- [x] Test: Each package contains embedded configDefaults
- [x] Test: No contentSources (derivable from source URL)
- [x] Test: Schema rejects packages missing required fields
- [x] Test: Schema validates source.type enum (git only for now)
- [x] Test: Storefronts keyed by stack ID (cross-reference validation)

## Files to Create

| File | Purpose |
|------|---------|
| `templates/demo-packages.json` | Unified package definitions (2 packages, 5 storefronts) |
| `templates/demo-packages.schema.json` | JSON Schema for validation |

## Implementation Details

### Structure: Option A (Nested Storefronts)

After PM discussion, the nested storefronts structure was chosen for:
- Clear visual grouping of storefronts by brand
- Self-contained package definitions
- No cross-references needed

### RED Phase

Create tests in `tests/templates/demo-packages.test.ts`:
```typescript
describe('demo-packages.json', () => {
  it('validates against schema', () => { /* Ajv validation */ });
  it('contains 2 packages with 5 storefronts total', () => { /* structure check */ });
  it('each package has configDefaults (no contentSources)', () => { /* embedded data */ });
  it('storefronts keyed by stack ID', () => { /* cross-reference */ });
});
```

### GREEN Phase

Create `demo-packages.json` with nested storefronts:
```json
{
  "$schema": "./demo-packages.schema.json",
  "version": "1.0.0",
  "packages": [
    {
      "id": "citisignal",
      "name": "CitiSignal",
      "configDefaults": { /* embedded */ },
      "storefronts": {
        "headless-paas": { "name": "...", "source": {...} },
        "eds-paas": { "name": "...", "source": {...} },
        "eds-accs": { "name": "...", "source": {...} }
      }
    },
    {
      "id": "buildright",
      "name": "BuildRight",
      "configDefaults": { /* embedded */ },
      "storefronts": {
        "eds-paas": { "name": "...", "source": {...} },
        "eds-accs": { "name": "...", "source": {...} }
      }
    }
  ]
}
```

### REFACTOR Phase

- Removed contentSources (EDS URLs derivable from source.url)
- Ensured consistent ordering of properties
- Validated stack IDs match stacks.json

## Expected Outcome

- Single `demo-packages.json` with 2 packages, 5 nested storefronts
- JSON Schema providing validation and IDE autocomplete
- All brand data embedded in configDefaults
- No contentSources (derivable from GitHub source URL)

## Acceptance Criteria

- [x] demo-packages.json exists with 2 packages, 5 storefronts
- [x] All packages pass schema validation
- [x] Each package contains embedded configDefaults
- [x] No contentSources (derivable from source.url)
- [x] Storefronts keyed by valid stack IDs
- [x] Schema provides accurate type definitions
- [x] Tests pass for structure validation (41 tests)

## Completion Notes

**Initial Completion:** Step 1 initially completed with flat structure (5 packages)

**Revision (PM Direction):** Revised to Option A (nested storefronts) per PM discussion:
- PM preferred visual grouping of storefronts by brand
- Confirmed EDS URLs are derivable from source.url (no contentSources needed)
- Chose nested structure for clarity over flat structure with cross-references

**Final Files:**
- `templates/demo-packages.json` - 2 packages with nested storefronts (5 total)
- `templates/demo-packages.schema.json` - JSON Schema for storefronts structure
- `tests/templates/demo-packages.test.ts` - 41 tests (all passing)

**Key Decisions:**
- Structure: Option A (nested storefronts keyed by stack ID)
- contentSources: Removed (EDS URLs derivable from GitHub source)
- Package count: 2 (citisignal with 3 storefronts, buildright with 2)
