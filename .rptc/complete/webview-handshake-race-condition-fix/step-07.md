## Step 7: Reverse Handshake - WebviewClient

**Purpose:** WebviewClient sends `__webview_ready__` first (per VS Code #125546).

**Prerequisites:**
- [ ] Step 6 completed

**Tests to Write First:**

- [ ] Test: Sends `__webview_ready__` on init
  - **Given:** WebviewClient created
  - **When:** initialize() runs
  - **Then:** `__webview_ready__` sent after event listener
  - **File:** `tests/core/ui/utils/WebviewClient.test.ts`

- [ ] Test: No `__extension_ready__` listener
  - **Given:** Handler registered
  - **When:** `__extension_ready__` received
  - **Then:** Ignored (no handler)
  - **File:** `tests/core/ui/utils/WebviewClient.test.ts`

**Files to Modify:**
- [ ] `src/core/ui/utils/WebviewClient.ts`

**Implementation:**

**RED:** Write failing tests above

**GREEN:**
1. Delete lines 74-82 (`__extension_ready__` handler)
2. After line 150 (end of addEventListener), add:
   ```typescript
   this.sendRawMessage({
     id: this.generateMessageId(),
     type: '__webview_ready__',
     timestamp: Date.now()
   });
   ```

**REFACTOR:** Verify handshake flow, clean comments

**Expected Outcome:**
- Webview initiates handshake
- `__handshake_complete__` still handled correctly

**Acceptance Criteria:**
- [ ] `__extension_ready__` listener removed
- [ ] `__webview_ready__` sent on init
- [ ] Tests passing

**Estimated Time:** 30 minutes
