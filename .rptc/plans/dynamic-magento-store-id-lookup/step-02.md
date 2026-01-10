# Step 2: Integrate into generateConfigJson with Fallback

## Status

- [x] Tests Written (RED)
- [x] Implementation Complete (GREEN)
- [x] Refactored (REFACTOR)

## Purpose

Call `fetchStoreConfig` from the `generateConfigJson` method to dynamically populate store IDs, with graceful fallback to hardcoded defaults (1, 1, 1, 2) when the fetch fails or endpoint is unavailable.

## Prerequisites

- Step 1 complete (`fetchStoreConfig` method exists in `EnvConfigPhase` class)

## Tests to Write First

**Test File:** `tests/features/eds/services/edsSetupPhases-storeConfig.test.ts` (same file as Step 1)

### Test Scenarios

- [ ] `generateConfigJson` uses dynamic values when `fetchStoreConfig` returns StoreConfig
- [ ] `generateConfigJson` uses hardcoded defaults (1, 1, 1, 2) when `fetchStoreConfig` returns null
- [ ] `generateConfigJson` skips storeConfig fetch when meshEndpoint is not available
- [ ] `generateConfigJson` logs info message indicating dynamic or fallback mode used

### Test Implementation Notes

```typescript
// Test dynamic values used
it('uses dynamic store IDs when fetchStoreConfig succeeds', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({
      data: {
        storeConfig: {
          id: '5',
          website_id: '3',
          root_category_id: '42'
        }
      }
    })
  });

  await phase.generateConfigJson(configWithMeshEndpoint);

  // Verify config.json was generated with dynamic values
  expect(mockGenerateConfigFile).toHaveBeenCalledWith(
    expect.objectContaining({
      placeholders: expect.objectContaining({
        '{STORE_VIEW_ID}': '5',
        '{WEBSITE_ID}': '3',
        '{YOUR_ROOT_CATEGORY_ID}': '42'
      })
    })
  );
});

// Test fallback values used
it('uses hardcoded defaults when fetchStoreConfig returns null', async () => {
  mockFetch.mockRejectedValueOnce(new Error('Network error'));

  await phase.generateConfigJson(configWithMeshEndpoint);

  // Verify config.json was generated with fallback defaults
  expect(mockGenerateConfigFile).toHaveBeenCalledWith(
    expect.objectContaining({
      placeholders: expect.objectContaining({
        '{STORE_ID}': '1',
        '{STORE_VIEW_ID}': '1',
        '{WEBSITE_ID}': '1',
        '{YOUR_ROOT_CATEGORY_ID}': '2'
      })
    })
  );
});
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/features/eds/services/edsSetupPhases.ts` | Modify | Update `generateConfigJson` to call `fetchStoreConfig` and use dynamic/fallback values |

## Implementation Details

### RED Phase

Add test scenarios to existing test file from Step 1. Tests verify:
1. Dynamic values flow through to `generateConfigFile` placeholders when fetch succeeds
2. Fallback values (1, 1, 1, 2) used when fetch returns null
3. Fetch skipped when no mesh endpoint available

### GREEN Phase

Modify `generateConfigJson` method (around lines 562-568) to:

**Before** (current hardcoded values):
```typescript
// Commerce store numeric IDs (defaults for demo environments)
// These are internal Magento IDs, typically "1" for default store setup
const storeId = '1';
const storeViewId = '1';
const websiteId = '1';
// Root category ID for product picker (category 2 is typical default after root)
const rootCategoryId = '2';
```

**After** (dynamic lookup with fallback):
```typescript
// Commerce store numeric IDs
// Attempt dynamic lookup via storeConfig GraphQL query, fall back to demo defaults
// Note: storeId remains hardcoded - not available via storeConfig query (see overview.md)
const storeId = '1';
let storeViewId = '1';
let websiteId = '1';
let rootCategoryId = '2';

if (config.meshEndpoint) {
    const storeConfig = await this.fetchStoreConfig(config.meshEndpoint);
    if (storeConfig) {
        storeViewId = storeConfig.storeViewId;
        websiteId = storeConfig.websiteId;
        rootCategoryId = storeConfig.rootCategoryId;
        this.logger.info('[EDS] Using dynamic store IDs from Commerce storeConfig');
    } else {
        this.logger.info('[EDS] Using default store IDs (storeConfig fetch failed)');
    }
} else {
    this.logger.debug('[EDS] Skipping storeConfig fetch (mesh endpoint not available)');
}
```

### REFACTOR Phase

- Ensure logging is consistent with existing patterns
- Verify no unnecessary complexity added
- Confirm fallback behavior preserves backward compatibility

## Expected Outcome

- `generateConfigJson` attempts storeConfig fetch when mesh endpoint available
- Dynamic store IDs populate config.json placeholders on successful fetch
- Fallback to defaults (1, 1, 1, 2) on any failure (silent, no user-facing errors)
- Clear logging indicates which mode was used (debug/info level)

## Acceptance Criteria

- [ ] All 4 test scenarios passing
- [ ] Dynamic values used when fetchStoreConfig succeeds
- [ ] Fallback values (1, 1, 1, 2) used when fetchStoreConfig returns null
- [ ] No user-visible errors on network failures
- [ ] Info-level logging indicates dynamic vs fallback mode
- [ ] Existing generateConfigJson tests continue to pass
- [ ] No breaking changes to existing functionality

## Dependencies from Other Steps

- Step 1: `fetchStoreConfig` private method must exist and return `StoreConfig | null`
- Step 1: `StoreConfig` interface must be defined with `storeViewId`, `websiteId`, `rootCategoryId`

## Estimated Time

1 hour (including tests)
