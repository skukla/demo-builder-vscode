# Step 2: Create EDS Mesh Repository

## Type: AUTOMATED (gh CLI)

**Purpose:** Create the EDS-specific mesh repository with passthrough configuration (no prefix transforms) and performance-optimized caching.

## Performance Context (From Research)

API Mesh on Edge (Cloudflare Workers) has excellent performance characteristics:
- Cold start: ~5ms (near-zero)
- Warm rate: 99.99%
- Global locations: 330+

**Key optimization:** Enable response caching to minimize backend calls and maximize EDS performance.

## Prerequisites

- [x] `gh` CLI installed and authenticated (`gh auth status`)
- [x] Step 1 completed (repo renamed to `headless-citisignal-mesh`)

## GitHub CLI Commands

```bash
# 1. Create new repository for EDS mesh
gh repo create skukla/eds-commerce-mesh --public --description "API Mesh configuration for EDS storefronts (passthrough, no prefixes)"

# 2. Clone the headless mesh as starting point
git clone https://github.com/skukla/headless-citisignal-mesh.git eds-commerce-mesh-temp
cd eds-commerce-mesh-temp

# 3. Change remote to new repo
git remote set-url origin https://github.com/skukla/eds-commerce-mesh.git

# 4. Update mesh.json (see content below)
# Edit mesh.json to remove prefix transforms and add caching

# 5. Commit and push
git add mesh.json
git commit -m "Configure EDS mesh: passthrough (no prefixes) with caching enabled"
git push -u origin main

# 6. Cleanup temp directory
cd ..
rm -rf eds-commerce-mesh-temp
```

## mesh.json Content

Replace the entire mesh.json with this EDS-optimized configuration:

```json
{
  "meshConfig": {
    "responseConfig": {
      "cache": true,
      "includeHTTPDetails": true
    },
    "sources": [
      {
        "name": "CommerceGraphQL",
        "handler": {
          "graphql": { "endpoint": "{env.ADOBE_COMMERCE_GRAPHQL_ENDPOINT}" }
        }
      },
      {
        "name": "CatalogService",
        "handler": {
          "graphql": { "endpoint": "{env.ADOBE_CATALOG_SERVICE_ENDPOINT}" }
        },
        "transforms": [
          { "encapsulate": { "applyTo": { "query": true, "mutation": false } } }
        ]
      }
    ]
  }
}
```

## Key Difference from Headless Mesh

| Aspect | EDS Mesh | Headless Mesh |
|--------|----------|---------------|
| Prefix transforms | None | `Commerce_`, `Catalog_` prefixes |
| Response caching | Enabled | Enabled |
| Use case | EDS storefronts (passthrough) | Headless storefronts (namespaced) |

## Performance Optimization Details

### Why Caching Matters

| Scenario | Expected Latency |
|----------|------------------|
| Mesh warm + cached | 170-300ms |
| Mesh warm, no cache | 200-350ms |
| Direct to Catalog Service | 150-250ms |

**Net overhead of passthrough mesh: ~50ms** - acceptable for the extensibility benefits.

### Caching Configuration

```json
"responseConfig": {
  "cache": true,           // Enable query-level caching
  "includeHTTPDetails": true  // Return cache headers for debugging
}
```

**Caching behavior:**
- GET and POST queries are cacheable
- Mutations are NOT cached (by design)
- TTL controlled by backend `cache-control` headers
- Response headers include: `Age`, `Cache-Status` (HIT/MISS), `Etag`

### Future Optimization (Optional)

For high-traffic production sites, consider adding Fastly CDN caching:
- Cache GraphQL GET requests at edge
- Use `x-api-key` for cache segmentation
- Implement cache invalidation via webhooks

## Verification

- [x] Repository `commerce-eds-mesh` exists at `skukla/commerce-eds-mesh`
- [x] mesh.json contains NO prefix transforms
- [x] mesh.json contains `"responseConfig": { "cache": true }`
- [x] CatalogService uses encapsulate only (for namespace isolation)
- [ ] Deploy mesh and verify caching works (check `Cache-Status` header) - deployment deferred

## No Extension Changes Required

This step requires no code changes - extension will reference this repo in Step 3.
