# Environment Variable Migration & Alignment Plan

## Executive Summary

**Problem**: Environment variables are inconsistently named across repositories, causing confusion and potential errors when the Demo Builder collects and populates .env files.

**Solution**: Standardize all variable names following Adobe naming conventions, update all codebases, and ensure Demo Builder uses the correct mappings.

## Critical Insights

### 1. Catalog Service & Live Search Share Endpoint
**Finding**: Both services use the SAME endpoint URL
- Current mesh uses: `ADOBE_SANDBOX_CATALOG_SERVICE_ENDPOINT` for both
- Demo Builder incorrectly assumes: separate `ADOBE_CATALOG_SERVICE_ENDPOINT` and `ADOBE_LIVE_SEARCH_ENDPOINT`

**Action**: Use single `ADOBE_CATALOG_SERVICE_ENDPOINT` variable

### 2. Commerce URL vs GraphQL Endpoint
**Finding**: These are related but different:
- Base URL: `https://instance.adobedemo.com`
- GraphQL Endpoint: `https://instance.adobedemo.com/graphql`

**Action**: Maintain both, with GraphQL endpoint being base + `/graphql`

### 3. Environment-Specific API Keys
**Finding**: Catalog Service has sandbox vs production keys
- Mesh correctly has: `ADOBE_CATALOG_API_KEY` and `ADOBE_PRODUCTION_CATALOG_API_KEY`
- Frontend only uses sandbox key

**Action**: Support both, use `ADOBE_CATALOG_ENVIRONMENT` to determine which

## Standardized Variable Naming Convention

### Tier 1: Core Commerce (Required by all)
```bash
ADOBE_COMMERCE_URL=https://instance.adobedemo.com
ADOBE_COMMERCE_ENVIRONMENT_ID=abc123def456
ADOBE_COMMERCE_WEBSITE_CODE=base
ADOBE_COMMERCE_STORE_CODE=main_website_store  
ADOBE_COMMERCE_STORE_VIEW_CODE=default
```

### Tier 2: API Mesh (Commerce Mesh only)
```bash
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=${ADOBE_COMMERCE_URL}/graphql
ADOBE_CATALOG_SERVICE_ENDPOINT=https://catalog-service-sandbox.adobe.io/graphql
ADOBE_CATALOG_ENVIRONMENT=sandbox
ADOBE_CATALOG_API_KEY=your_sandbox_key
ADOBE_PRODUCTION_CATALOG_API_KEY=your_production_key
```

### Tier 3: Frontend (CitiSignal Next.js)
```bash
MESH_ENDPOINT=https://edge-sandbox-graph.adobe.io/api/mesh-id/graphql
ADOBE_ASSETS_URL=https://delivery-xxx.adobeaemcloud.com
ADOBE_COMMERCE_CUSTOMER_GROUP=hash_value
```

### Tier 4: Integration Service (Kukla Integration)
```bash
ADOBE_COMMERCE_ADMIN_USERNAME=admin
ADOBE_COMMERCE_ADMIN_PASSWORD=password
AWS_ACCESS_KEY_ID=key
AWS_SECRET_ACCESS_KEY=secret
```

## Detailed Migration Steps

### Step 1: Commerce Mesh Updates

**File: `.env.example`**
```diff
- ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://your-instance.adobedemo.com/graphql
+ ADOBE_COMMERCE_URL=https://your-instance.adobedemo.com
+ ADOBE_COMMERCE_GRAPHQL_ENDPOINT=${ADOBE_COMMERCE_URL}/graphql

- ADOBE_SANDBOX_CATALOG_SERVICE_ENDPOINT=https://catalog-service-sandbox.adobe.io/graphql
+ ADOBE_CATALOG_SERVICE_ENDPOINT=https://catalog-service-sandbox.adobe.io/graphql
+ ADOBE_CATALOG_ENVIRONMENT=sandbox
```

**File: `mesh.config.js`**
```diff
 handler: {
   graphql: {
-    endpoint: '{env.ADOBE_COMMERCE_GRAPHQL_ENDPOINT}',
+    endpoint: '{env.ADOBE_COMMERCE_GRAPHQL_ENDPOINT}',  # No change needed

 handler: {
   graphql: {
-    endpoint: '{env.ADOBE_SANDBOX_CATALOG_SERVICE_ENDPOINT}',
+    endpoint: '{env.ADOBE_CATALOG_SERVICE_ENDPOINT}',
```

### Step 2: Kukla Integration Service Updates

**File: `.env.example`**
```diff
- COMMERCE_BASE_URL=https://your-commerce-instance.adobedemo.com
+ ADOBE_COMMERCE_URL=https://your-commerce-instance.adobedemo.com

- COMMERCE_ADMIN_USERNAME=your_admin_username
+ ADOBE_COMMERCE_ADMIN_USERNAME=your_admin_username

- COMMERCE_ADMIN_PASSWORD=your_admin_password
+ ADOBE_COMMERCE_ADMIN_PASSWORD=your_admin_password
```

**Files to update: ALL action files in `dist/application/actions/**/*.js`**
```javascript
// Find/replace:
params.COMMERCE_BASE_URL → params.ADOBE_COMMERCE_URL
params.COMMERCE_ADMIN_USERNAME → params.ADOBE_COMMERCE_ADMIN_USERNAME
params.COMMERCE_ADMIN_PASSWORD → params.ADOBE_COMMERCE_ADMIN_PASSWORD
```

### Step 3: CitiSignal Next.js Updates

**File: `.env.example`**
```diff
 MESH_ENDPOINT=https://edge-sandbox-graph.adobe.io/api/your-mesh-id/graphql
 ADOBE_COMMERCE_URL=https://your-url-here
+ ADOBE_COMMERCE_GRAPHQL_ENDPOINT=${ADOBE_COMMERCE_URL}/graphql
 ADOBE_ASSETS_URL=https://delivery-p57319-e1619941.adobeaemcloud.com
 ADOBE_COMMERCE_ENVIRONMENT_ID=your-environment-id
 ADOBE_COMMERCE_STORE_VIEW_CODE=default
 ADOBE_COMMERCE_WEBSITE_CODE=base
 ADOBE_COMMERCE_STORE_CODE=main_website_store
 ADOBE_CATALOG_API_KEY=your-catalog-service-staging-or-public-key
 ADOBE_COMMERCE_CUSTOMER_GROUP=customer-group-id-hash
- USE_MESH=true  # Remove deprecated
```

**File: `src/app/api/graphql/route.ts`** (No changes needed - already correct)

### Step 4: Demo Builder Template Updates

**File: `templates/components.json`**

Update environment variable definitions:
1. Remove `ADOBE_LIVE_SEARCH_ENDPOINT` (it's the same as Catalog Service)
2. Ensure `ADOBE_COMMERCE_GRAPHQL_ENDPOINT` is included for mesh
3. Add `ADOBE_CATALOG_ENVIRONMENT` selector
4. Update all `providedBy` and `usedBy` relationships

## Variable Mapping Matrix

| Final Variable Name | CitiSignal | Mesh | Integration | Demo Builder |
|---------------------|-----------|------|-------------|--------------|
| ADOBE_COMMERCE_URL | ✅ | ➕ ADD | ➕ RENAME | ✅ |
| ADOBE_COMMERCE_GRAPHQL_ENDPOINT | ➕ ADD | ✅ | ❌ | ➕ ADD |
| ADOBE_CATALOG_SERVICE_ENDPOINT | ❌ | ➕ RENAME | ❌ | ✅ |
| ADOBE_CATALOG_ENVIRONMENT | ❌ | ➕ ADD | ❌ | ✅ |
| ADOBE_CATALOG_API_KEY | ✅ | ✅ | ❌ | ✅ |
| ADOBE_PRODUCTION_CATALOG_API_KEY | ❌ | ✅ | ❌ | ✅ |
| ADOBE_COMMERCE_ADMIN_USERNAME | ❌ | ❌ | ➕ RENAME | ✅ |
| ADOBE_COMMERCE_ADMIN_PASSWORD | ❌ | ❌ | ➕ RENAME | ✅ |
| MESH_ENDPOINT | ✅ | ❌ | ❌ | ✅ |
| ADOBE_ASSETS_URL | ✅ | ❌ | ❌ | ✅ |

Legend:
- ✅ = Already correct
- ➕ ADD = Need to add
- ➕ RENAME = Need to rename from existing
- ❌ = Not used

## Testing Checklist

### After Commerce Mesh Updates
- [ ] Build mesh.json successfully
- [ ] Mesh deploys without errors
- [ ] Catalog Service queries work
- [ ] Live Search queries work
- [ ] Commerce GraphQL queries work

### After Integration Service Updates  
- [ ] Admin token generation works
- [ ] Product API calls succeed
- [ ] All environment variables resolve correctly

### After CitiSignal Updates
- [ ] GraphQL proxy works
- [ ] Mesh endpoint connection succeeds
- [ ] Headers pass correctly
- [ ] Store view routing works

### After Demo Builder Updates
- [ ] Settings Collection form shows correct fields
- [ ] Field grouping matches actual usage
- [ ] .env files populate correctly
- [ ] No duplicate or missing variables

## Implementation Order

1. **First**: Commerce Mesh (foundational - mesh.config.js drives mesh.json)
2. **Second**: Demo Builder templates (updates collection interface)
3. **Third**: Kukla Integration Service (fewer files to update)
4. **Fourth**: CitiSignal Next.js (add complementary variables)

## Rollback Plan

Each repository change should be:
1. Made in a feature branch
2. Tested independently
3. Committed with clear message
4. Merged only after validation

If issues arise:
```bash
git revert <commit-hash>
```

## Notes

- **Backward Compatibility**: Old variable names will break. This is a breaking change.
- **Documentation**: Update README.md in each repo with new variable names
- **Demo Builder**: Must update BOTH collection AND deployment logic
