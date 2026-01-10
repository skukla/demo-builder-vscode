# Step 2: Add DA.live Project Listing Logs

## Purpose

Enhance logging in `edsDaLiveOrgHandlers.ts` to trace why DA.live sites sometimes appear empty. Current logging exists but lacks detail on token state, raw API responses, and filtering outcomes.

## Prerequisites

- [ ] Step 1 complete (GitHub repo logging added)
- [ ] Familiarity with `handleGetDaLiveSites` function structure

## Implementation Details

**File**: `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/src/features/eds/handlers/edsDaLiveOrgHandlers.ts`

**Logs to Add in `handleGetDaLiveSites`**:

1. **Token validation** (after line 160):
   ```typescript
   context.logger.debug(`[EDS] DA.live token present: ${!!token}, length: ${token?.length || 0}`);
   ```

2. **Request details** (before fetch at line 170):
   ```typescript
   const url = `https://admin.da.live/list/${orgName}/`;
   context.logger.debug(`[EDS] DA.live request URL: ${url}`);
   ```

3. **Response status** (after fetch, before ok check):
   ```typescript
   context.logger.debug(`[EDS] DA.live response status: ${response.status}, ok: ${response.ok}`);
   ```

4. **Raw entries before filter** (after line 191):
   ```typescript
   context.logger.debug(`[EDS] DA.live raw entries: ${JSON.stringify(entries.slice(0, 3))}...`);
   ```

5. **Filter outcome** (after siteItems creation, around line 216):
   ```typescript
   context.logger.debug(`[EDS] DA.live filter: ${entries.length} raw -> ${siteItems.length} sites`);
   ```

## Expected Outcome

Logs will show the complete data flow:
- Whether token exists and its length
- Exact API URL called
- HTTP response status
- Raw entries from API (sample)
- How many entries filtered out

## Acceptance Criteria

- [ ] Token presence logged with length
- [ ] Request URL logged before fetch
- [ ] Response status logged explicitly
- [ ] Raw entries sample logged before filtering
- [ ] Filter outcome (raw count vs final count) logged
- [ ] No sensitive data (full token) exposed in logs
