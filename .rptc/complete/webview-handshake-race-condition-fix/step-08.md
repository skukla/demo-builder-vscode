# Step 8: Reverse handshake - Extension

**Purpose:** Update WebviewCommunicationManager to wait for `__webview_ready__` instead of initiating with `__extension_ready__`

**Prerequisites:**
- [ ] Step 7 completed (WebviewClient sends `__webview_ready__` first)

---

## Tests to Write First

- [ ] Test: Extension waits for webview ready signal
  - **Given:** WebviewCommunicationManager initializing
  - **When:** No `__extension_ready__` sent, listener for `__webview_ready__` registered
  - **Then:** Extension waits passively, does not initiate handshake
  - **File:** `tests/core/communication/webviewCommunicationManager.test.ts`

- [ ] Test: Extension sends handshake complete after receiving ready
  - **Given:** Extension receives `__webview_ready__`
  - **When:** Webview ready handler executes
  - **Then:** Extension sends `__handshake_complete__` with stateVersion
  - **File:** `tests/core/communication/webviewCommunicationManager.test.ts`

- [ ] Test: Handshake timeout if webview never sends ready
  - **Given:** Extension waiting for `__webview_ready__`
  - **When:** Timeout (10s) expires before signal received
  - **Then:** Promise rejects with "Webview handshake timeout" error
  - **File:** `tests/core/communication/webviewCommunicationManager.test.ts`

---

## Files to Modify

- [ ] `src/core/communication/webviewCommunicationManager.ts` - Remove extension-first handshake

---

## Implementation Details

### RED Phase (Update tests)

Update existing handshake tests to match reversed protocol:

```typescript
describe('WebviewCommunicationManager', () => {
    it('should wait for webview ready without sending extension ready', async () => {
        const manager = new WebviewCommunicationManager(mockPanel);
        const initPromise = manager.initialize();

        // Extension should NOT send __extension_ready__
        expect(mockPanel.webview.postMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: '__extension_ready__' })
        );

        // Simulate webview sending ready
        mockPanel.webview.onDidReceiveMessage.mock.calls[0][0]({
            type: '__webview_ready__',
            id: 'test-id',
            timestamp: Date.now()
        });

        await initPromise;

        // Extension should send handshake complete
        expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: '__handshake_complete__' })
        );
    });
});
```

### GREEN Phase (Minimal implementation)

**File:** `src/core/communication/webviewCommunicationManager.ts`

**Remove lines 115-120:**
```typescript
// DELETE THIS BLOCK
// Send extension ready signal
this.sendRawMessage({
    id: uuidv4(),
    type: '__extension_ready__',
    timestamp: Date.now(),
});
```

**Keep lines 123-145 (wait for webview ready)** - No changes needed

### REFACTOR Phase

- [ ] Verify no other code expects `__extension_ready__` signal
- [ ] Update handshake documentation in class JSDoc
- [ ] Ensure consistent timeout handling

---

## Expected Outcome

- Extension no longer initiates handshake
- Extension waits passively for `__webview_ready__`
- After receiving ready, extension sends `__handshake_complete__`
- Handshake protocol matches WebviewClient (Step 7)

---

## Acceptance Criteria

- [ ] `__extension_ready__` send removed (lines 115-120 deleted)
- [ ] Wait for `__webview_ready__` logic preserved
- [ ] `__handshake_complete__` sent after receiving ready
- [ ] All handshake tests passing
- [ ] No regression in message queuing/flushing
- [ ] Handshake timeout still functional

---

**Estimated Time:** 1 hour
