# Step 2: Add Backend Component Definitions

## Purpose

Add placeholder component IDs to `components.json` for future backend options (ACCS and ACO addon). These minimal definitions enable testing the `requiredAny` OR logic with realistic component IDs.

## Prerequisites

- [ ] Step 1 complete (`requiredAny` field available in wizard step definitions)

## Tests to Write First (RED Phase)

**Note**: This is configuration-only. No new code tests required - existing Step 1 tests already validate OR logic with component IDs.

## Files to Modify

### `templates/components.json`

**Changes**:
1. Add `adobe-commerce-accs` to `selectionGroups.backends` array
2. Add `adobe-commerce-accs` component definition (placeholder)
3. Add `adobe-commerce-aco` component definition (ACO addon placeholder)

## Implementation Details (GREEN Phase)

### 1. Update Selection Groups

```json
"selectionGroups": {
  "frontends": ["citisignal-nextjs"],
  "backends": ["adobe-commerce-paas", "adobe-commerce-accs"],
  "dependencies": ["commerce-mesh", "demo-inspector"],
  "appBuilderApps": ["integration-service"],
  "integrations": ["experience-platform"]
}
```

### 2. Add ACCS Backend Component

Add after `adobe-commerce-paas` definition:

```json
"adobe-commerce-accs": {
  "name": "Adobe Commerce Cloud Service",
  "description": "App Builder-based commerce backend (placeholder for Phase 3)",
  "configuration": {
    "nodeVersion": "20"
  }
}
```

### 3. Add ACO Addon Component

Add as separate component (addon, not backend):

```json
"adobe-commerce-aco": {
  "name": "Adobe Commerce Optimizer",
  "description": "Commerce optimization addon (placeholder for Phase 3)",
  "addonFor": ["adobe-commerce-paas"]
}
```

## Expected Outcome

- `components.json` contains three backend-related component IDs
- Component IDs available for `requiredAny` array usage in wizard steps
- No functional changes to wizard behavior (placeholders only)

## Acceptance Criteria

- [ ] `adobe-commerce-accs` added to backends selection group
- [ ] `adobe-commerce-accs` component definition present
- [ ] `adobe-commerce-aco` component definition present
- [ ] JSON remains valid (no syntax errors)
- [ ] Existing functionality unaffected
