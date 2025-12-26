# Step 1: Inventory JSON Config Files and Their Test Coverage

## Purpose
Map all JSON template files to their current test coverage status. Identify gaps requiring remediation, with special focus on `components.json` which triggered the v3.0.0 mock drift issue.

## Prerequisites
- [ ] Access to `templates/` directory
- [ ] Access to `tests/templates/` directory

## Tests to Write First (RED Phase)

### Test 1: Verify all JSON files have coverage tracking
- [ ] Test: `type-json-alignment.test.ts` should import and validate `components.json`
- **Given:** components.json exists with v3.0.0 structure
- **When:** type-json-alignment.test.ts runs
- **Then:** components.json fields are validated against TypeScript types
- **File:** `tests/templates/type-json-alignment.test.ts` (extend existing)

## Files to Create/Modify
| Action | File | Description |
|--------|------|-------------|
| Review | `tests/templates/type-json-alignment.test.ts` | Existing alignment test (covers templates, stacks, brands) |
| Identify | `templates/components.json` | v3.0.0 structure needing coverage |

## Implementation Details (GREEN Phase)

### Current Coverage Status

**Covered by `type-json-alignment.test.ts`:**
- templates.json (DemoTemplate alignment)
- stacks.json (Stack alignment)
- brands.json (Brand alignment)

**NOT covered (gaps):**
- **components.json** (CRITICAL - v3.0.0 structure, caused mock drift)
- api-services.json
- defaults.json
- logging.json
- mesh-config.json
- prerequisites.json
- wizard-steps.json

### Priority
Focus on `components.json` - it's the root cause of the test mock drift issue.

## Expected Outcome
- [ ] Coverage gap for components.json documented
- [ ] Decision: extend type-json-alignment.test.ts pattern to include components.json
- [ ] Field list from ComponentsConfig TypeScript types identified

## Acceptance Criteria
- [ ] All 10 JSON config files inventoried
- [ ] Coverage status documented (3 covered, 7 gaps)
- [ ] components.json confirmed as priority for Step 2

## Dependencies from Other Steps
- None (this is the first step)
