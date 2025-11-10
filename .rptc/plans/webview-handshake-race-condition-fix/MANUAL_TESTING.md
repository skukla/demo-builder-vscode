# Manual Testing Procedures - Webview Handshake Protocol

## Overview

This document provides manual testing procedures to verify the webview handshake race condition fix is fully operational across all 4 webviews.

**Completed:** 2025-11-10
**Test Environment:** VS Code Extension Host
**Webviews to Test:** Wizard, Welcome, Dashboard, Configure

---

## Test 1: 50-Cycle Flakiness Test

**Purpose:** Verify handshake eliminates race conditions under rapid create/dispose cycles

**Procedure:**

1. **Install Extension** (via F5 debug mode)
   - Run Extension Host with `npm run watch`
   - Open VS Code Extension Development Host

2. **Test Each Webview** (50 consecutive open/close cycles)

   ```javascript
   // Run in Extension Development Host Debug Console
   for (let i = 0; i < 50; i++) {
       await vscode.commands.executeCommand('adobe-demo-builder.wizard');
       await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
       console.log(`Cycle ${i + 1}/50 complete`);
   }
   ```

   Repeat for:
   - `adobe-demo-builder.wizard` (Project Creation Wizard)
   - `adobe-demo-builder.welcome` (Welcome Screen)
   - `adobe-demo-builder.dashboard` (Project Dashboard)
   - `adobe-demo-builder.configure` (Configure Project)

3. **Expected Results:**
   - **Success Rate:** 100% (50/50 cycles open without timeout)
   - **Handshake Time:** <3 seconds per webview
   - **No Timeout Errors:** No "Webview handshake timeout" errors in console

4. **Failure Indicators:**
   - Webview shows blank screen
   - Console shows "Webview handshake timeout" error
   - Webview UI never renders

**Acceptance Criteria:**
- [ ] Wizard: 50/50 cycles successful
- [ ] Welcome: 50/50 cycles successful
- [ ] Dashboard: 50/50 cycles successful
- [ ] Configure: 50/50 cycles successful

---

## Test 2: Artificial Delay Test

**Purpose:** Verify message queuing works correctly even with slow bundle loading

**Procedure:**

1. **Add Artificial Delay** (Simulate slow machine/network)

   Edit `src/core/ui/utils/WebviewClient.ts`:

   ```typescript
   constructor() {
       // Add 5-second delay before initialization
       setTimeout(() => {
           this.initialize();
       }, 5000);
   }
   ```

2. **Test Message Queuing:**
   - Open wizard webview
   - Click "Continue" on Welcome step (sends message before handshake)
   - Wait 5 seconds for bundle to load
   - Verify message is delivered after handshake completes

3. **Expected Results:**
   - Webview loads after 5-second delay
   - Messages sent before handshake are queued
   - Queued messages flushed after `__handshake_complete__`
   - No lost messages

4. **Remove Artificial Delay** after test

**Acceptance Criteria:**
- [ ] Webview loads successfully after 5-second delay
- [ ] Messages queued during delay are delivered after handshake
- [ ] No messages lost during delayed initialization

---

## Test 3: Multi-Webview Stress Test

**Purpose:** Verify multiple webviews can open simultaneously without conflicts

**Procedure:**

1. **Open All 4 Webviews Simultaneously:**

   ```javascript
   // Run in Extension Development Host Debug Console
   await Promise.all([
       vscode.commands.executeCommand('adobe-demo-builder.wizard'),
       vscode.commands.executeCommand('adobe-demo-builder.welcome'),
       vscode.commands.executeCommand('adobe-demo-builder.dashboard'),
       vscode.commands.executeCommand('adobe-demo-builder.configure')
   ]);
   ```

2. **Verify All Load:**
   - All 4 tabs open in VS Code
   - All 4 webviews render correctly
   - No timeout errors in console

3. **Expected Results:**
   - All webviews open in <3 seconds
   - No interference between webviews
   - Each handshake completes independently

**Acceptance Criteria:**
- [ ] All 4 webviews open successfully
- [ ] Load time <3 seconds for all webviews
- [ ] No race conditions between webviews

---

## Test 4: DevTools Inspection

**Purpose:** Verify handshake protocol and CSP compliance via browser DevTools

**Procedure:**

1. **Open Webview DevTools:**
   - Open any webview (e.g., wizard)
   - Right-click in webview
   - Select "Inspect Element"

2. **Check Console (CSP Violations):**
   - Look for CSP violation warnings
   - Verify no "unsafe-inline" or "unsafe-eval" errors

3. **Check Network Tab (Bundle Load Order):**
   - Reload webview (Cmd+R / Ctrl+R)
   - Verify bundle load order:
     1. `runtime-bundle.js`
     2. `vendors-bundle.js`
     3. `common-bundle.js`
     4. `wizard-bundle.js` (or other feature bundle)

4. **Check Console (Handshake Timing):**
   - Enable debug logging if available
   - Look for handshake sequence:
     1. `[WebviewClient] Sending __webview_ready__`
     2. `[WebviewComm] Received __webview_ready__`
     3. `[WebviewComm] Handshake complete`

5. **Expected Results:**
   - **No CSP violations**
   - **Bundles load in correct order**
   - **Handshake completes in <1 second**
   - **No JavaScript errors**

**Acceptance Criteria:**
- [ ] No CSP violations in Console
- [ ] Bundles load in correct order (runtime → vendors → common → feature)
- [ ] Handshake sequence visible in logs
- [ ] No JavaScript errors or warnings

---

## Test 5: Handshake Protocol Flow Verification

**Purpose:** Verify the reversed handshake protocol is working as designed

**Procedure:**

1. **Enable Debug Logging:**
   - Set `enableLogging: true` in WebviewCommunicationManager config
   - Add console.log statements to WebviewClient if needed

2. **Open Wizard Webview:**
   - Run `adobe-demo-builder.wizard` command
   - Watch VS Code Output channels:
     - "Demo Builder: Debug"
     - Browser DevTools Console

3. **Verify Handshake Sequence:**
   - Extension sets up message listener (NO `__extension_ready__` sent)
   - Webview sends `__webview_ready__` immediately after bundle load
   - Extension receives `__webview_ready__` and sends `__handshake_complete__`
   - Both sides flush queued messages

4. **Expected Log Sequence:**

   ```
   [Extension] WebviewComm: Starting initialization
   [Extension] WebviewComm: Message listener registered
   [Webview]   WebviewClient: Sending __webview_ready__
   [Extension] WebviewComm: Received __webview_ready__
   [Extension] WebviewComm: Sending __handshake_complete__
   [Webview]   WebviewClient: Handshake complete
   [Extension] WebviewComm: Flushing 0 queued messages
   ```

**Acceptance Criteria:**
- [ ] Extension does NOT send `__extension_ready__`
- [ ] Webview sends `__webview_ready__` first
- [ ] Extension responds with `__handshake_complete__`
- [ ] Message queuing and flushing works correctly

---

## Test 6: Timeout Handling

**Purpose:** Verify timeout works correctly if webview never sends ready signal

**Procedure:**

1. **Simulate Webview Failure:**
   - Comment out `__webview_ready__` send in WebviewClient.ts
   - Open wizard webview

2. **Expected Results:**
   - Webview shows blank screen
   - After 10 seconds (handshake timeout), extension logs error:
     `Error: Webview handshake timeout`
   - No infinite waiting

3. **Restore Code** after test

**Acceptance Criteria:**
- [ ] Extension times out after 10 seconds
- [ ] Clear error message logged
- [ ] No infinite waiting or freezing

---

## Test Summary Checklist

**Before submitting PR, verify all tests pass:**

- [ ] Test 1: 50-cycle flakiness test (all 4 webviews)
- [ ] Test 2: Artificial delay test (message queuing)
- [ ] Test 3: Multi-webview stress test (concurrent opening)
- [ ] Test 4: DevTools inspection (CSP, bundles, timing)
- [ ] Test 5: Handshake protocol flow verification
- [ ] Test 6: Timeout handling

**Failure Rate Threshold:** 0% (all tests must pass 100%)

---

## Troubleshooting

### Webview Shows Blank Screen

**Symptoms:** Webview opens but content never loads
**Possible Causes:**
1. JavaScript bundle failed to load
2. CSP blocking scripts
3. Handshake timeout

**Debugging Steps:**
1. Open DevTools Console (right-click → Inspect Element)
2. Check for JavaScript errors
3. Check Network tab for failed bundle loads
4. Check Console for CSP violations
5. Check "Demo Builder: Debug" output channel for handshake logs

### Handshake Timeout Error

**Symptoms:** Console shows "Webview handshake timeout" after 10 seconds
**Possible Causes:**
1. WebviewClient not sending `__webview_ready__`
2. Bundle loading failed
3. JavaScript error during initialization

**Debugging Steps:**
1. Verify all 4 bundles loaded in Network tab
2. Check for JavaScript errors in DevTools Console
3. Verify `__webview_ready__` sent in console logs
4. Check extension logs for message receipt

### Messages Not Delivered

**Symptoms:** UI actions (button clicks) don't trigger backend
**Possible Causes:**
1. Handshake not complete
2. Message handler not registered
3. postMessage failed

**Debugging Steps:**
1. Check handshake completed (look for `__handshake_complete__`)
2. Verify message handlers registered in extension
3. Check DevTools Console for postMessage calls
4. Check extension logs for message receipt

---

## Notes

- **Test Environment:** VS Code 1.80+ recommended
- **Browser:** Chromium-based (VS Code webview engine)
- **Performance:** Tests run on standard development machine (no slow CI environment)
- **Automation:** Manual tests only (50-cycle test requires human verification of visual loading)

**Test Results Location:** Document results in PR description or `.rptc/plans/webview-handshake-race-condition-fix/test-results.md`
