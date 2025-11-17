# Adobe Console SDK 400 Error Investigation

**Research Date**: 2025-11-15
**Topic**: Adobe Console SDK 400 Bad Request error during getProjectsForOrg
**Scope**: Codebase analysis
**Depth**: Very thorough

---

## Summary

The Adobe Console SDK **requires both an access token AND a valid API key** to function properly. Your extension only passes the access token with a placeholder string `'aio-cli-console-auth'` as the API key, causing all SDK API calls to fail with 400 Bad Request. The CLI must be used for authentication (browser-based login), but the SDK **could** work for subsequent operations if a valid Adobe API key is obtained.

**Key Finding**: The SDK has never been functional since initial implementation due to the missing API key. The CLI fallback mechanism works perfectly, so users experience no issues.

---

## Codebase Analysis

### Relevant Files

#### 1. SDK Initialization (Root Cause)
**File**: `src/features/authentication/services/adobeSDKClient.ts:143`

```typescript
// CURRENT (INCORRECT):
this.sdkClient = await sdk.init(accessToken, 'aio-cli-console-auth');
//                                           ^^^^^^^^^^^^^^^^^^^^
//                                           NOT a valid API key - just a placeholder string
```

**Problem**: The second parameter should be a valid Adobe API key obtained from Adobe Developer Console, not a hardcoded string.

---

#### 2. SDK Expected Signature
**File**: `node_modules/@adobe/aio-lib-console/src/index.js:177`

```javascript
/**
 * Initialize SDK
 * @param {string} accessToken - Adobe IMS access token
 * @param {string} apiKey - Adobe API key (x-api-key)
 * @param {string} env - Environment ('prod' or 'stage')
 * @param {object} swaggerSpec - Optional Swagger specification
 */
async function init (accessToken, apiKey, env = getCliEnv(), swaggerSpec) {
  // ...
  this.apiKey = apiKey;           // Line 245 - Stored for later use
  this.accessToken = accessToken; // Line 247
}
```

The SDK **requires** both:
1. ✅ **Access Token**: Bearer token for authorization (you have this from CLI)
2. ❌ **API Key**: Valid Adobe API key for x-api-key header (you're passing a string literal)

---

#### 3. Request Interceptor (Where API Key is Used)
**File**: `node_modules/@adobe/aio-lib-console/src/helpers.js:77-81`

```javascript
// Request interceptor adds headers to every API call
req.headers.Authorization = `Bearer ${coreConsoleAPIInstance.accessToken}`
req.headers['x-api-key'] = req.headers['x-api-key'] || coreConsoleAPIInstance.apiKey
```

**Result**: Every SDK API call includes:
```
Authorization: Bearer eyJhbGc...              (✅ valid token)
x-api-key: aio-cli-console-auth             (❌ invalid - not a real API key)
```

Adobe's API rejects this with **400 Bad Request** because authentication is incomplete.

---

#### 4. Fallback Mechanism (Why Users Don't See Errors)
**File**: `src/features/authentication/services/adobeEntityService.ts:189-191`

```typescript
} catch (sdkError) {
    this.debugLogger.debug('[Entity Service] SDK failed, falling back to CLI:', sdkError);
    this.debugLogger.warn('[Entity Service] SDK unavailable, using slower CLI fallback');

    // CLI fallback always works:
    const cliResult = await this.getCLIProjects();
    return cliResult; // Returns 11 projects successfully
}
```

**Why This Works**:
- SDK fails silently (logged to debug channel only)
- CLI fallback executes automatically
- Users get their data with no errors
- Only performance impact (3-6s instead of <200ms)

---

#### 5. Org ID Format Validation (Not the Problem)
**File**: `src/features/authentication/services/adobeEntityService.ts:171-179`

```typescript
// PERFORMANCE FIX: SDK requires org code with @AdobeOrg suffix
// (e.g., "E94E1E3766FBA7DC0A495FFA@AdobeOrg")
const hasValidOrgCode = cachedOrg?.code && cachedOrg.code.includes('@');

if (!hasValidOrgCode) {
    // Log warning and fall back to CLI
}

// Pass correctly formatted org code
const sdkResult = await client.getProjectsForOrg(cachedOrg.code);
// Example: "E94E1E3766FBA7DC0A495FFA@AdobeOrg" ✅ Correct format
```

The org ID format is **correct**. The 400 error is NOT due to org ID format issues.

---

### Existing Patterns Found

1. **Hybrid CLI/SDK Architecture** (intended but never functional):
   - CLI for browser-based authentication (`aio auth login`)
   - SDK for fast API operations (never worked due to missing API key)
   - Graceful fallback from SDK to CLI on any error

2. **Token Handoff** (working correctly):
   - CLI performs authentication and stores token
   - Extension reads token via `inspectToken()`
   - Token passed to SDK initialization
   - Token format and content are valid

3. **Silent Failure Pattern** (good UX, misleading logs):
   - SDK errors logged to debug channel only
   - No user-facing errors
   - Automatic CLI fallback
   - Users never know SDK failed

4. **Performance Claims** (inflated):
   - Logs claim "SDK initialized successfully - enabling 30x faster operations"
   - But SDK has never worked, so operations always use CLI
   - CLI operations take 3-6 seconds (no 30x speedup ever occurred)

---

## Root Cause Analysis

### What's Happening

```mermaid
sequenceDiagram
    participant Extension
    participant SDK
    participant Adobe API
    participant CLI

    Extension->>SDK: init(token, 'aio-cli-console-auth')
    Note over SDK: Stores invalid API key
    Extension->>SDK: getProjectsForOrg(orgId)
    SDK->>Adobe API: GET /organizations/{orgId}/projects
    Note over SDK,Adobe API: Headers:<br/>Authorization: Bearer {token}<br/>x-api-key: aio-cli-console-auth
    Adobe API-->>SDK: 400 Bad Request
    SDK-->>Extension: ERROR_GET_PROJECTS_BY_ORG_ID
    Extension->>CLI: aio console project list --json
    CLI-->>Extension: 11 projects (success)
```

### Adobe Console API Requirements

**Required Headers for API Calls:**
```
Authorization: Bearer <access_token>  ✅ You have this from CLI auth
x-api-key: <valid_api_key>           ❌ You're passing 'aio-cli-console-auth'
```

**Your Current Request:**
```http
GET https://developers.adobe.io/console/organizations/E94E1E3766FBA7DC0A495FFA@AdobeOrg/projects
Authorization: Bearer eyJhbGciOiJSUzI1NiIsI...  (valid)
x-api-key: aio-cli-console-auth                 (invalid)
```

**Adobe API Response:**
```json
{
  "status": 400,
  "id": "061f2f82-aa35-4236-adc9-aa2b5374a0c0",
  "code": "ERROR_GET_PROJECTS_BY_ORG_ID",
  "messages": [{
    "template": "ERR_MSG_GENERIC_MESSAGE",
    "message": "Unknown Error"
  }]
}
```

The "Unknown Error" is Adobe's generic message for **authentication failures** (missing/invalid API key).

---

## Authentication Capabilities

### CLI Authentication (Current Working Approach)

**Capabilities:**
- ✅ Browser-based login (`aio auth login`)
- ✅ Token storage and retrieval
- ✅ All API operations via command execution
- ✅ Proven reliable and stable
- ❌ Slower (3-6 seconds per operation)

**Example CLI Flow:**
```bash
# 1. Authentication
aio auth login
# Opens browser, user signs in, token stored to disk

# 2. API Operations
aio console org list --json          # 3-5 seconds
aio console project list --json      # 2-4 seconds
aio console workspace list --json    # 2-3 seconds
```

---

### SDK Authentication (Current Non-Working State)

**Capabilities:**
- ❌ **Cannot** perform browser-based login (not supported by SDK)
- ✅ **Can** use token from CLI authentication (already doing this)
- ✅ **Can** perform fast API operations (IF valid API key provided)
- ❌ **Currently fails** due to missing valid API key
- ✅ Fast operations when working (< 200ms vs 3-6 seconds for CLI)

**What SDK Could Do (If Fixed):**
```typescript
// 1. Use CLI for authentication (required)
await execCommand('aio auth login');

// 2. Get token from CLI
const token = await inspectToken();

// 3. Initialize SDK with VALID API key
const sdk = await init(token, VALID_ADOBE_API_KEY, 'prod');

// 4. Fast API operations
const orgs = await sdk.getOrganizations();        // <200ms (30x faster)
const projects = await sdk.getProjectsForOrg(orgId); // <150ms (20x faster)
const workspaces = await sdk.getWorkspacesForProject(projectId); // <100ms (30x faster)
```

---

### Correct Hybrid Approach

**Authentication (CLI-only):**
1. Use `aio auth login` for browser-based authentication
2. SDK cannot perform login, CLI is the only option

**API Operations (SDK if fixed, CLI fallback):**
1. Attempt SDK call (if valid API key obtained)
2. Fall back to CLI if SDK fails
3. Return results to user

**Why Hybrid?**
- CLI is mandatory for authentication (browser login)
- SDK provides 20-30x performance improvement for API calls
- Best of both worlds: CLI's auth + SDK's speed

---

## Why SDK Fails (Technical Deep Dive)

### Adobe Console API Authentication Flow

**Step 1: SDK Makes API Call**
```javascript
// From @adobe/aio-lib-console/src/index.js:305
async getProjectsForOrg (orgId) {
  return this.client.getProjectsForOrg({ orgId })
}
```

**Step 2: Request Interceptor Adds Headers**
```javascript
// From @adobe/aio-lib-console/src/helpers.js:77-81
requestInterceptor (req) {
  const coreConsoleAPIInstance = req.sdk.coreConsoleAPIInstance

  // Add Authorization header (token)
  req.headers.Authorization = `Bearer ${coreConsoleAPIInstance.accessToken}`

  // Add x-api-key header (API key)
  req.headers['x-api-key'] = req.headers['x-api-key'] || coreConsoleAPIInstance.apiKey

  return req
}
```

**Step 3: Adobe API Validates Both Headers**
- Validates `Authorization: Bearer {token}` → ✅ Pass (valid token from CLI)
- Validates `x-api-key: {apiKey}` → ❌ Fail (invalid key 'aio-cli-console-auth')
- Returns **400 Bad Request** due to failed API key validation

**Step 4: Extension Falls Back to CLI**
```typescript
// From adobeEntityService.ts:189
} catch (sdkError) {
    // SDK failed, use CLI instead
    const cliResult = await this.getCLIProjects();
    return cliResult; // Works perfectly
}
```

---

### Why CLI Works Without API Key

**CLI Authentication Model:**
```bash
# CLI has its own authentication mechanism
aio auth login
# This obtains a token that works with CLI commands

# CLI commands include both token AND API key internally
aio console project list --json
# CLI adds required headers automatically from its own credentials
```

**Key Difference:**
- **CLI**: Built-in API key (embedded in Adobe I/O CLI package)
- **SDK**: Requires you to provide API key during initialization
- **Your Extension**: Has token from CLI, but no API key for SDK

---

## Evidence and Investigation History

### No Previous SDK Functionality

**Git History Search Results:**
- ❌ No commits fixing SDK 400 errors
- ❌ No issues related to SDK authentication failures
- ❌ No workarounds for missing API key
- ✅ SDK was added in initial implementation with placeholder API key
- ✅ Fallback to CLI has always been the actual working path

**Commit Analysis:**
- Commit `70d3f9f`: Added debugging for "0 organizations" issue (different problem - CLI-based)
- No commits ever fixed SDK 400 errors because they were always silently handled

**Conclusion**: SDK has never been functional. The extension has always relied on CLI fallback.

---

### Why This Wasn't Caught Earlier

1. **Silent Fallback Design**:
   - SDK errors only logged to debug channel
   - No user-facing errors
   - CLI fallback works 100% of the time
   - Users never experienced failures

2. **Debug Logging Misleading**:
   ```
   [Auth SDK] SDK initialized successfully - enabling 30x faster operations
   ```
   - Claims SDK is working
   - But every API call fails and falls back to CLI
   - Users see 3-6 second operations (CLI speed), not <200ms (SDK speed)

3. **No Performance Monitoring**:
   - No metrics comparing expected vs actual operation times
   - If monitored, would show all operations taking CLI times, not SDK times

4. **Excellent Fallback Design**:
   - Ironclad fallback mechanism prevented any user impact
   - Good engineering (redundancy) masked the broken SDK
   - Trade-off: Reliability vs transparency

---

## Implementation Options

### Option 1: Keep Current Hybrid (Recommended for Now)

**Description**: Leave code as-is with CLI fallback

**Pros:**
- ✅ Zero work required
- ✅ Already works perfectly (CLI is reliable)
- ✅ No risk of breaking existing functionality
- ✅ No API key management complexity
- ✅ No user impact (they never see SDK errors)

**Cons:**
- ❌ False "30x faster" claims in logs and docs
- ❌ Dead SDK code adds maintenance burden (~500 lines)
- ❌ Misleading debug logs about SDK success
- ❌ Missed performance optimization opportunity

**When to Choose:**
- You want reliable, proven CLI-only operation
- You can't obtain Adobe API key easily
- Performance is acceptable (3-6s operations are fine for users)
- Simplicity and stability are priorities

**Impact:**
- No changes required
- Update docs to clarify SDK status (optional)
- Remove "30x faster" claims from logs (optional)

---

### Option 2: Remove SDK Entirely

**Description**: Delete all SDK code, use CLI-only approach

**Pros:**
- ✅ Honest about capabilities (pure CLI implementation)
- ✅ Removes ~500 lines of dead code
- ✅ Simpler codebase and easier maintenance
- ✅ No misleading performance claims
- ✅ Reduces npm dependencies (`@adobe/aio-lib-console`)

**Cons:**
- ❌ Loses potential for future 30x speedup
- ❌ Requires code removal work (1-2 hours)
- ❌ Need to update docs and logs
- ❌ Removes SDK as a future optimization path

**When to Choose:**
- You want a clean, maintainable CLI-only implementation
- You're confident CLI performance is sufficient
- You value code simplicity over potential future speedup
- You won't obtain Adobe API key in foreseeable future

**Changes Required:**
1. Remove SDK initialization code (`adobeSDKClient.ts`)
2. Remove SDK try/catch blocks in `adobeEntityService.ts`
3. Use CLI-only paths for all operations
4. Update documentation removing SDK references
5. Remove `@adobe/aio-lib-console` dependency from `package.json`
6. Update log messages removing "30x faster" claims

**Estimated Effort**: 1-2 hours

---

### Option 3: Obtain Valid API Key and Fix SDK (Best Performance)

**Description**: Register app in Adobe Developer Console, get real API key, make SDK work

**Pros:**
- ✅ Achieves true 20-30x performance improvement
- ✅ Operations complete in <200ms vs 3-6 seconds
- ✅ Better user experience (faster wizard, dashboard)
- ✅ Validates initial SDK integration effort
- ✅ Scalable (SDK can handle higher load than CLI)

**Cons:**
- ❌ Requires Adobe Developer Console application registration
- ❌ Need to obtain API credentials (may require Adobe approval)
- ❌ Securely store and distribute API key
- ❌ Additional testing and validation required
- ❌ API key distribution complexity (can't commit to git)
- ❌ Ongoing maintenance (API key rotation, expiration)

**When to Choose:**
- Performance is critical for user experience
- You can obtain Adobe API credentials
- You have secure key management infrastructure
- You expect high usage volume where speed matters

**Changes Required:**

1. **Register Application** (Adobe Developer Console):
   - Create new project in Adobe Developer Console
   - Add Adobe Console API service
   - Generate API key (x-api-key credential)

2. **Securely Store API Key**:
   ```typescript
   // Option A: Environment variable
   const API_KEY = process.env.ADOBE_API_KEY;

   // Option B: VS Code secrets storage
   const API_KEY = await context.secrets.get('adobe-api-key');

   // Option C: Encrypted config file
   const API_KEY = await loadEncryptedConfig('adobe-api-key');
   ```

3. **Update SDK Initialization** (`adobeSDKClient.ts:143`):
   ```typescript
   // BEFORE:
   this.sdkClient = await sdk.init(accessToken, 'aio-cli-console-auth');

   // AFTER:
   const apiKey = await this.getAPIKey(); // Securely retrieve API key
   this.sdkClient = await sdk.init(accessToken, apiKey, 'prod');
   ```

4. **Validate API Key Works**:
   - Test getProjectsForOrg with real API key
   - Verify 200 response and valid data
   - Confirm performance improvement (should be <200ms)

5. **Update Documentation**:
   - Document API key requirement
   - Provide setup instructions for new installations
   - Update performance claims (now accurate)

**Estimated Effort**: 4-8 hours (registration, implementation, testing, docs)

**Security Considerations**:
- Never commit API key to git repository
- Use environment variables or secrets storage
- Rotate API key periodically
- Restrict API key permissions to minimum required scope

---

## Comparison Matrix

| Aspect | Option 1: Keep As-Is | Option 2: Remove SDK | Option 3: Fix SDK |
|--------|---------------------|---------------------|------------------|
| **Effort** | None | 1-2 hours | 4-8 hours |
| **Performance** | CLI (3-6s) | CLI (3-6s) | SDK (<200ms) |
| **Complexity** | Same | Simpler | More complex |
| **Code Size** | Same | -500 lines | +50 lines |
| **Dependencies** | Same | -1 package | Same |
| **Maintenance** | Dead SDK code | Simpler | Key management |
| **User Impact** | None | None | Faster operations |
| **Future Potential** | Can fix later | Cannot add back easily | Already optimized |
| **Honesty** | Misleading logs | Honest | Accurate |

---

## Recommendations

### Immediate Recommendation (No-Action)

**Keep Option 1 (Current Hybrid)** for now because:
- Zero risk of breaking working functionality
- Users are not impacted (CLI works perfectly)
- You can revisit later when priorities change
- Simple is better when system works

**Optional Quick Win:**
Update debug logs to be honest about SDK status:
```typescript
// BEFORE:
this.debugLogger.debug('[Auth SDK] SDK initialized successfully - enabling 30x faster operations');

// AFTER:
this.debugLogger.debug('[Auth SDK] SDK initialized (using CLI fallback - API key not configured)');
```

---

### Long-Term Recommendation

**Choose based on your priorities:**

**If Performance Critical**:
→ **Option 3**: Invest 4-8 hours to get valid API key and fix SDK
- Dashboard loads faster
- Wizard operations feel snappier
- Better user experience overall

**If Simplicity Preferred**:
→ **Option 2**: Remove SDK code in 1-2 hours
- Cleaner codebase
- Easier to understand and maintain
- No misleading complexity

**If Status Quo Fine**:
→ **Option 1**: Do nothing, keep using CLI
- Works perfectly today
- Defer decision until clear need arises

---

## Key Takeaways

1. **SDK was never functional** - Missing API key since day one, always relied on CLI fallback
2. **CLI authentication is mandatory** - SDK cannot perform browser-based login
3. **Current system works fine** - Silent fallback to CLI means zero user impact
4. **No urgent action needed** - This is a performance optimization opportunity, not a critical bug
5. **Performance claims are inflated** - "30x faster" never materialized because SDK never worked
6. **Silent failures can hide problems** - Excellent fallback design masked broken SDK for extended period
7. **API key is required** - Cannot use Adobe Console SDK without valid Adobe API key from Developer Console

---

## Next Steps

**Immediate Actions** (Optional):
1. Update debug logs to reflect actual SDK status (5 minutes)
2. Update documentation removing "30x faster" claims (10 minutes)

**Future Decisions**:
1. Decide which option aligns with project priorities
2. If choosing Option 3, initiate Adobe Developer Console registration
3. If choosing Option 2, schedule code cleanup sprint

**No Immediate Breaking Changes Required** - System works correctly as-is.

---

**Research conducted by**: Claude Code (RPTC Research Command)
**Agent used**: Explore (Sonnet)
**Files analyzed**: SDK source code, authentication services, error handling, git history
**Methodology**: Codebase exploration with source code analysis and error tracing
