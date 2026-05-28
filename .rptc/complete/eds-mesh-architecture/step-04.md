# Step 4: Update Config Generation

**Purpose:** Update EDS `config.json` generation so both commerce endpoints route through the mesh.

**Prerequisites:**
- [x] Step 3 completed (component registry and stack routing updated)

## Tests to Write First

### Unit Tests: Config Generation Both Endpoints Use Mesh

**File:** `tests/features/eds/services/edsSetupPhases-configJson.test.ts`

- [x] Test: generateConfigJson sets both endpoints empty when no mesh available
  - **Given:** PaaS backend config without meshEndpoint
  - **When:** generateConfigJson called
  - **Then:** Both `commerce-core-endpoint` and `commerce-endpoint` are empty strings

- [x] Test: generateConfigJson sets both endpoints to mesh URL when available
  - **Given:** PaaS backend config with meshEndpoint set
  - **When:** generateConfigJson called
  - **Then:** Both endpoints equal meshEndpoint value

- [x] Test: updateConfigJsonWithMeshEndpoint sets both endpoints to mesh
  - **Given:** Existing config.json with empty endpoints
  - **When:** updateConfigJsonWithMeshEndpoint called with mesh URL
  - **Then:** Both `commerce-core-endpoint` and `commerce-endpoint` equal mesh URL

- [x] Test: placeholder {CS_ENDPOINT} uses mesh endpoint not catalog service
  - **Given:** PaaS config with meshEndpoint
  - **When:** generateConfigJson processes template placeholders
  - **Then:** `{CS_ENDPOINT}` replaced with meshEndpoint (not catalog-service.adobe.io)

## Files to Modify

- [x] `src/features/eds/services/edsSetupPhases.ts`
  - `generateConfigJson`: Change `commerce-endpoint` default from hardcoded catalog URL to empty/mesh
  - `generateConfigJson`: Change `{CS_ENDPOINT}` placeholder to use `config.meshEndpoint || ''`
  - `updateConfigJsonWithMeshEndpoint`: Change `commerce-endpoint` from catalog URL to meshEndpoint

## Implementation Details

**RED Phase:** Write tests verifying both endpoints use mesh.

**GREEN Phase:** Update three locations:
1. Line 576: `'commerce-endpoint': config.meshEndpoint || ''`
2. Line 584: `'{CS_ENDPOINT}': config.meshEndpoint || ''`
3. Line 660: `'commerce-endpoint': meshEndpoint`

**REFACTOR Phase:** Remove hardcoded catalog service URL constant if no longer used.

## Acceptance Criteria

- [x] Both endpoints use mesh URL when available
- [x] Both endpoints empty when mesh not yet deployed
- [x] No direct catalog-service.adobe.io references in generated config.json
- [x] Tests pass for all scenarios

**Estimated Time:** 1 hour
