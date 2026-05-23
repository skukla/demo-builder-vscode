# Step 1: Add Private storeConfig Fetcher to EnvConfigPhase

## Status

- [x] Tests Written (RED)
- [x] Implementation Complete (GREEN)
- [x] Refactored (REFACTOR)

## Purpose

Add a private method to fetch store configuration IDs (store view, website, root category) from Commerce GraphQL endpoint, enabling dynamic replacement of hardcoded IDs.

## Prerequisites

- None (this is the first step)

## Tests to Write First (RED Phase)

**Test File:** `tests/features/eds/services/edsSetupPhases-storeConfig.test.ts`

### Test Scenarios

- [ ] `fetchStoreConfig` returns parsed StoreConfig on successful response
- [ ] `fetchStoreConfig` returns null on network timeout (AbortError)
- [ ] `fetchStoreConfig` returns null on invalid JSON response
- [ ] `fetchStoreConfig` returns null on missing fields in response
- [ ] `fetchStoreConfig` returns null on HTTP error (4xx, 5xx)
- [ ] `fetchStoreConfig` uses correct GraphQL query and headers

### Test Implementation Notes

```typescript
// Mock global fetch for unit testing
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Access private method for testing - use type assertion or expose via test helper
// Option 1: Type assertion to access private method
const phase = new EnvConfigPhase(/* deps */);
const fetchStoreConfig = (phase as any)['fetchStoreConfig'].bind(phase);

// Test success case
it('returns parsed StoreConfig on successful response', async () => {
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

  const result = await fetchStoreConfig('https://commerce.example.com/graphql');

  expect(result).toEqual({
    storeViewId: '5',
    websiteId: '3',
    rootCategoryId: '42'
  });
});

// Test timeout case
it('returns null on network timeout', async () => {
  const abortError = new Error('The operation was aborted');
  abortError.name = 'AbortError';
  mockFetch.mockRejectedValueOnce(abortError);

  const result = await fetchStoreConfig('https://commerce.example.com/graphql');

  expect(result).toBeNull();
});
```

## Files to Modify

**Modify:** `src/features/eds/services/edsSetupPhases.ts`

- Add `StoreConfig` interface (private type near EnvConfigPhase class)
- Add `fetchStoreConfig` private method to `EnvConfigPhase` class

## Implementation Details (GREEN Phase)

### Type Definition

Add before `EnvConfigPhase` class (around line 515):

```typescript
/**
 * Store configuration IDs from Commerce storeConfig query
 * Used for dynamic ID lookup instead of hardcoded defaults
 */
interface StoreConfig {
    storeViewId: string;
    websiteId: string;
    rootCategoryId: string;
}
```

### Method Implementation

Add to `EnvConfigPhase` class, before `generateConfigJson` method (around line 525):

```typescript
/**
 * Fetch store configuration IDs from Commerce GraphQL endpoint
 * Uses publicly accessible storeConfig query (no auth required)
 *
 * @param graphqlEndpoint - Full GraphQL URL (e.g., https://commerce.example.com/graphql)
 * @returns StoreConfig if successful, null on any error
 */
private async fetchStoreConfig(graphqlEndpoint: string): Promise<StoreConfig | null> {
    try {
        const response = await fetch(graphqlEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: '{ storeConfig { id website_id root_category_id } }',
            }),
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            this.logger.debug(`[EDS] storeConfig fetch failed: ${response.status}`);
            return null;
        }

        const json = await response.json();
        const config = json?.data?.storeConfig;

        if (!config?.id || !config?.website_id || !config?.root_category_id) {
            this.logger.debug('[EDS] storeConfig response missing required fields');
            return null;
        }

        return {
            storeViewId: String(config.id),
            websiteId: String(config.website_id),
            rootCategoryId: String(config.root_category_id),
        };
    } catch (error) {
        this.logger.debug(`[EDS] storeConfig fetch error: ${(error as Error).message}`);
        return null;
    }
}
```

### Pattern Reference

This implementation follows the exact pattern from `edsHandlers.ts:96`:
- Native `fetch()` with POST method
- `Content-Type: application/json` header
- `AbortSignal.timeout(10000)` for 10-second timeout
- Graceful error handling returning null

## Expected Outcome

- Private `fetchStoreConfig` method added to `EnvConfigPhase` class
- All 6 test scenarios pass
- Method returns `StoreConfig` on success, `null` on any failure
- No user-visible errors on failure (graceful degradation)
- Debug logging for troubleshooting

## Acceptance Criteria

- [ ] All 6 test scenarios passing
- [ ] Method follows existing fetch pattern (edsHandlers.ts:96)
- [ ] 10-second timeout matches existing pattern
- [ ] Returns null on any error (graceful failure)
- [ ] Debug logging on error for troubleshooting
- [ ] No breaking changes to existing functionality

## Dependencies from Other Steps

- None (this is Step 1)
- Step 2 will integrate this method into `generateConfigJson`

## Estimated Time

1-2 hours (including tests)
