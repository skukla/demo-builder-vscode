# Environment Variable Alignment Analysis

## Current State Across Repositories

### 1. CitiSignal Next.js (.env.example)
```
MESH_ENDPOINT
ADOBE_COMMERCE_URL
ADOBE_ASSETS_URL
ADOBE_COMMERCE_ENVIRONMENT_ID
ADOBE_COMMERCE_STORE_VIEW_CODE
ADOBE_COMMERCE_WEBSITE_CODE
ADOBE_COMMERCE_STORE_CODE
ADOBE_CATALOG_API_KEY
ADOBE_COMMERCE_CUSTOMER_GROUP
USE_MESH
```

### 2. Commerce Mesh (.env.example)
```
ADOBE_COMMERCE_GRAPHQL_ENDPOINT
ADOBE_SANDBOX_CATALOG_SERVICE_ENDPOINT
ADOBE_CATALOG_API_KEY
ADOBE_PRODUCTION_CATALOG_API_KEY
ADOBE_COMMERCE_ENVIRONMENT_ID
ADOBE_COMMERCE_WEBSITE_CODE
ADOBE_COMMERCE_STORE_CODE
ADOBE_COMMERCE_STORE_VIEW_CODE
```

### 3. Kukla Integration Service (.env.example)
```
COMMERCE_BASE_URL
COMMERCE_ADMIN_USERNAME
COMMERCE_ADMIN_PASSWORD
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

## Key Inconsistencies Found

### Issue #1: Commerce Base URL Naming
- **CitiSignal**: `ADOBE_COMMERCE_URL`
- **Mesh**: `ADOBE_COMMERCE_GRAPHQL_ENDPOINT` (GraphQL endpoint)
- **Integration**: `COMMERCE_BASE_URL`

**Problem**: Three different names for essentially the same base Commerce URL

### Issue #2: Missing Live Search Endpoint
- **Mesh config** uses `ADOBE_SANDBOX_CATALOG_SERVICE_ENDPOINT` for BOTH Catalog AND Live Search
- **Demo Builder** has separate `ADOBE_CATALOG_SERVICE_ENDPOINT` and `ADOBE_LIVE_SEARCH_ENDPOINT`
- **Reality**: Live Search and Catalog Service share the same endpoint

### Issue #3: Production API Key Handling
- **Mesh**: Has `ADOBE_PRODUCTION_CATALOG_API_KEY` separate from sandbox
- **CitiSignal**: Only has `ADOBE_CATALOG_API_KEY` (assumes sandbox)
- **Demo Builder**: Has both but may not be using them correctly

### Issue #4: Commerce GraphQL Endpoint
- **Mesh**: Uses `ADOBE_COMMERCE_GRAPHQL_ENDPOINT` (full GraphQL URL)
- **CitiSignal**: Uses `ADOBE_COMMERCE_URL` (base URL only)
- **Integration**: Uses `COMMERCE_BASE_URL` (base URL only)

### Issue #5: Endpoint vs Service Endpoint Naming
- Mesh uses: `ADOBE_SANDBOX_CATALOG_SERVICE_ENDPOINT`
- Demo Builder templates show: `ADOBE_CATALOG_SERVICE_ENDPOINT` and `ADOBE_LIVE_SEARCH_ENDPOINT`

## Variables That Match (Good! ✅)
```
ADOBE_COMMERCE_ENVIRONMENT_ID
ADOBE_COMMERCE_WEBSITE_CODE  
ADOBE_COMMERCE_STORE_CODE
ADOBE_COMMERCE_STORE_VIEW_CODE
ADOBE_CATALOG_API_KEY
ADOBE_COMMERCE_CUSTOMER_GROUP
```

## Recommended Standardized Variable Names

### Core Commerce Configuration
```
ADOBE_COMMERCE_URL                     # Base Commerce instance URL (without /graphql)
ADOBE_COMMERCE_GRAPHQL_ENDPOINT        # Full GraphQL endpoint (ADOBE_COMMERCE_URL + /graphql)
ADOBE_COMMERCE_ENVIRONMENT_ID
ADOBE_COMMERCE_WEBSITE_CODE
ADOBE_COMMERCE_STORE_CODE
ADOBE_COMMERCE_STORE_VIEW_CODE
ADOBE_COMMERCE_CUSTOMER_GROUP
ADOBE_COMMERCE_ADMIN_USERNAME          # For integration service
ADOBE_COMMERCE_ADMIN_PASSWORD          # For integration service
```

### Catalog & Live Search Service
```
ADOBE_CATALOG_SERVICE_ENDPOINT         # Catalog Service endpoint (shared with Live Search)
ADOBE_CATALOG_ENVIRONMENT              # 'sandbox' or 'production'
ADOBE_CATALOG_API_KEY                  # Sandbox API key
ADOBE_PRODUCTION_CATALOG_API_KEY       # Production API key
```

### API Mesh
```
MESH_ENDPOINT                          # Generated Mesh GraphQL endpoint
```

### Other Services
```
ADOBE_ASSETS_URL                       # AEM Assets delivery URL
AWS_ACCESS_KEY_ID                      # For integration service
AWS_SECRET_ACCESS_KEY                  # For integration service
```

## Migration Plan

### Phase 1: Update Commerce Mesh
1. Rename `ADOBE_SANDBOX_CATALOG_SERVICE_ENDPOINT` → `ADOBE_CATALOG_SERVICE_ENDPOINT`
2. Update mesh.config.js to use standardized names
3. Ensure mesh.json generation uses correct variable names

### Phase 2: Update Kukla Integration Service
1. Rename `COMMERCE_BASE_URL` → `ADOBE_COMMERCE_URL`
2. Rename `COMMERCE_ADMIN_USERNAME` → `ADOBE_COMMERCE_ADMIN_USERNAME`
3. Rename `COMMERCE_ADMIN_PASSWORD` → `ADOBE_COMMERCE_ADMIN_PASSWORD`

### Phase 3: Update CitiSignal Next.js
1. Add `ADOBE_COMMERCE_GRAPHQL_ENDPOINT` for direct Commerce GraphQL (derived from ADOBE_COMMERCE_URL)
2. Remove `USE_MESH` (deprecated)
3. Ensure all variable names match standards

### Phase 4: Update Demo Builder Templates
1. Update components.json with correct variable names
2. Ensure providedBy/usedBy relationships are accurate
3. Update field grouping to match actual usage

