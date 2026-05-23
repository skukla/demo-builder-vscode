# Step 3: Update Component Registry and Stack Routing

## Purpose

Update `components.json` to separate mesh configurations for EDS (passthrough) and headless (prefixed operations) storefronts, ensuring each frontend type uses the appropriate mesh repository. This step consolidates all `components.json` changes including mesh entries, stack routing, and frontend dependencies.

## Prerequisites

- [x] Step 1 complete (headless-citisignal-mesh repo renamed)
- [x] Step 2 complete (eds-commerce-mesh repo created with passthrough config)

## Tests to Write First

### Unit Tests: Mesh Registry

**File:** `tests/features/components/services/ComponentRegistryManager-mesh-entries.test.ts`

- [x] **Test: Both mesh entries exist in registry**
  - Given: components.json is loaded
  - When: mesh section is accessed
  - Then: both `headless-commerce-mesh` and `eds-commerce-mesh` exist

- [x] **Test: Mesh entries have correct repository URLs**
  - Given: components.json with updated mesh entries
  - When: source URLs are retrieved
  - Then: `headless-commerce-mesh` points to `skukla/headless-citisignal-mesh`, `eds-commerce-mesh` points to `skukla/eds-commerce-mesh`

### Unit Tests: Stack Routing

**File:** `tests/features/components/stackRouting.test.ts`

- [x] **Test: EDS-PaaS stack requires eds-commerce-mesh**
  - Given: components.json loaded
  - When: Reading stacks.eds-paas.requiredComponents
  - Then: Contains "eds-commerce-mesh", not "commerce-mesh"

- [x] **Test: EDS-ACCS stack requires no mesh**
  - Given: components.json loaded
  - When: Reading stacks.eds-accs.requiredComponents
  - Then: Empty array (ACCS has built-in catalog service)

- [x] **Test: Headless-PaaS stack requires headless-commerce-mesh**
  - Given: components.json loaded
  - When: Reading stacks.headless-paas.requiredComponents
  - Then: Contains "headless-commerce-mesh"

- [x] **Test: Headless frontend dependency updated**
  - Given: components.json loaded
  - When: Reading frontends.headless.dependencies.required
  - Then: Contains "headless-commerce-mesh", not "commerce-mesh"

- [x] **Test: No references to old "commerce-mesh" remain**
  - Given: components.json loaded
  - When: Searching for "commerce-mesh" in stacks and frontend dependencies
  - Then: No matches found (only mesh.* keys allowed)

## Files to Modify

- [x] `src/features/components/config/components.json` - Update mesh section, stacks, and frontend dependency

## Implementation Details

### RED Phase

Write tests verifying mesh entry names, URLs, stack references, and frontend dependencies before making changes.

### GREEN Phase

1. **Rename `commerce-mesh` to `headless-commerce-mesh`** (lines 123-157):
   - Update key from `commerce-mesh` to `headless-commerce-mesh`
   - Change name to "Headless Commerce API Mesh"
   - Update description to mention prefixed operations for Next.js
   - Update URL to `https://github.com/skukla/headless-citisignal-mesh`

2. **Add `eds-commerce-mesh` entry** (after headless-commerce-mesh):
   - New key `eds-commerce-mesh`
   - Name: "EDS Commerce API Mesh"
   - Description: "GraphQL gateway with passthrough for EDS dropins"
   - URL: `https://github.com/skukla/eds-commerce-mesh`
   - Same configuration as headless-commerce-mesh

3. **Update headless frontend dependency** (line 81):
   - Change `"required": ["commerce-mesh"]` to `"required": ["headless-commerce-mesh"]`

4. **Update stacks** (lines 192-217):
   - `eds-paas` (line 198): Change requiredComponents from `["commerce-mesh"]` to `["eds-commerce-mesh"]`
   - `headless-paas` (line 214): Change requiredComponents from `["commerce-mesh"]` to `["headless-commerce-mesh"]`
   - Note: `eds-accs` already has `"requiredComponents": []` which is correct

### REFACTOR Phase

Ensure consistent naming and descriptions across both mesh entries.

## Expected Outcome

- Two distinct mesh entries in component registry
- Stack type determines which mesh component is installed
- EDS projects get passthrough mesh (no GraphQL prefixes)
- Headless projects get prefixed mesh (Catalog_*, Commerce_*)
- Frontend dependency chain intact
- All existing functionality preserved

## Acceptance Criteria

- [x] All mesh registry tests pass
- [x] All stack routing tests pass
- [x] No references to old `commerce-mesh` key remain in stacks or frontend dependencies
- [x] JSON validates against schema

## Estimated Time

1.5 hours
