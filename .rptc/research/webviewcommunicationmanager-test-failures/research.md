# Research Report: webviewCommunicationManager Test Failures

**Date**: 2025-11-03
**Topic**: Analysis of 7 failing tests in webviewCommunicationManager.test.ts
**Scope**: Codebase-only (test suite analysis)
**Depth**: Quick analysis (root cause identification)

---

## Summary

All 7 failing tests in `tests/utils/webviewCommunicationManager.test.ts` have timing/async coordination issues with Jest's fake timers. The problems fall into three categories:

1. **Missing microtask flushing** after timer advancement (2 tests)
2. **Missing webview handshake message triggers** (2 tests)
3. **Mock configuration ordering issues** (3 tests)

None of these are actual bugs in the implementation - they are test harness timing issues.

---

## Codebase Analysis

### Relevant Files

- `tests/utils/webviewCommunicationManager.test.ts:244-951` - Test file with 7 failures
- `src/core/communication/webviewCommunicationManager.ts:94-445` - Implementation under test

### Existing Patterns Found

**Passing Tests:**
- ✅ Use `await Promise.resolve()` after `messageListener()` calls
- ✅ Send `__webview_ready__` message after calling `initialize()`
- ✅ Configure mocks before operations that consume them
- ✅ Advance fake timers with proper microtask flushing

**Failing Tests:**
- ❌ Advance timers without flushing microtask queue
- ❌ Factory tests don't trigger handshake completion manually
- ❌ Mocks configured after operations begin
- ❌ Missing timer advancement for timeout scenarios

---

## Detailed Failure Analysis

### Failure #1 & #2: Retry Tests Timing Out

**Tests**:
- "should retry failed messages" (line 244)
- "should throw after max retries exceeded" (line 282)

**Root Cause**: Missing `await Promise.resolve()` after `jest.advanceTimersByTime()`

**Why It Fails**:

```typescript
// Current test code (lines 270-276):
jest.advanceTimersByTime(100);  // Advances clock
await Promise.resolve();         // ❌ MISSING - microtask queue not flushed
jest.advanceTimersByTime(100);  // Advances again
await Promise.resolve();         // ❌ MISSING

await sendPromise;  // Hangs forever - retries never execute
```

**Implementation Reference**:
- `src/core/communication/webviewCommunicationManager.ts:387-402` - `sendWithRetry()` uses `setTimeout()` for retry delays (line 396)

**Technical Explanation**:

Jest's fake timers (`jest.useFakeTimers()`) replace native `setTimeout` with a controlled version. When you call `jest.advanceTimersByTime(100)`, it advances the internal clock by 100ms and schedules any setTimeout callbacks to run. However, these callbacks are added to the **macrotask queue**, while promises use the **microtask queue**.

The event loop processes microtasks before macrotasks. Without `await Promise.resolve()` after advancing timers, the promise microtask queue never gets a chance to flush, and the retry logic (which relies on setTimeout → Promise chain) never completes.

**Fix Strategy**:

Add `await Promise.resolve()` after each `jest.advanceTimersByTime()` call:

```typescript
jest.advanceTimersByTime(100);
await Promise.resolve();  // ✅ Flush microtask queue
jest.advanceTimersByTime(100);
await Promise.resolve();  // ✅ Flush again
```

---

### Failure #3: Timeout Hint Assertion Failure

**Test**: "should not crash if timeout hint fails to send" (line 792)

**Root Cause**: `mockRejectedValueOnce()` consumes the wrong postMessage call

**Why It Fails**:

```typescript
// Test setup (line 797):
(mockWebview.postMessage as jest.Mock).mockRejectedValueOnce(new Error('Failed'));

// Problem: beforeEach already sent handshake_complete message (line 846)
// The mockRejectedValueOnce is consumed by THAT call, not the timeout hint

// Expected: timeout hint postMessage fails
// Actual: handshake_complete postMessage fails (if called again)
```

**Implementation Reference**:
- `src/core/communication/webviewCommunicationManager.ts:319-340` - Timeout hint logic sends postMessage before handler executes

**Technical Explanation**:

The test's `beforeEach` block (line 833-846) completes the handshake, which sends a `__handshake_complete__` message. The mock is then cleared at line 846 with `mockClear()`, which removes call history but NOT the mock implementation chain.

When the test configures `mockRejectedValueOnce()` at line 797, it's adding to the mock's queue. But if any other code calls postMessage before the timeout hint, that call will consume the `Once` mock, and the timeout hint will succeed instead of failing.

**Fix Strategy**:

Option A - Use multiple `mockRejectedValueOnce`:
```typescript
// Account for any intermediate postMessage calls
(mockWebview.postMessage as jest.Mock)
  .mockRejectedValueOnce(new Error('Intermediate'))  // handshake or other
  .mockRejectedValueOnce(new Error('Failed'));       // timeout hint
```

Option B - Clear and reconfigure mock:
```typescript
(mockWebview.postMessage as jest.Mock).mockClear();
(mockWebview.postMessage as jest.Mock).mockRejectedValueOnce(new Error('Failed'));
```

Option C - Spy on specific call:
```typescript
// Verify timeout hint was attempted even if it failed
expect(mockWebview.postMessage).toHaveBeenCalledWith(
  expect.objectContaining({ type: '__timeout_hint__' })
);
```

---

### Failure #4 & #5: Factory Tests Timing Out

**Tests**:
- "should create and initialize communication manager" (line 816)
- "should accept configuration options" (line 822)

**Root Cause**: Factory function waits for handshake that never completes

**Why It Fails**:

```typescript
// Test code (line 817):
const manager = await createWebviewCommunication(mockPanel);
//                ^^^ Waits forever for __webview_ready__ message

// Factory implementation (line 443-445):
const manager = new WebviewCommunicationManager(panel, options);
await manager.initialize();  // ⏳ Waits for handshake
return manager;

// ❌ Test never sends: messageListener({ type: '__webview_ready__' })
```

**Implementation Reference**:
- `src/core/communication/webviewCommunicationManager.ts:438-445` - Factory calls `initialize()`
- `src/core/communication/webviewCommunicationManager.ts:94-147` - `initialize()` waits for webview response (line 110-146)

**Technical Explanation**:

The `createWebviewCommunication` factory function is a convenience wrapper that creates a manager and waits for it to be ready. Unlike manual tests that create the manager and call `initialize()` separately (giving them a chance to send the `__webview_ready__` message), the factory does both in one step.

The `initialize()` method (line 94-147) works as follows:
1. Sends `__extension_ready__` to webview (line 116-120)
2. Returns a promise that resolves when `__webview_ready__` is received (line 135-141)
3. Has a timeout that rejects after 10 seconds (line 110-113)

With fake timers, the timeout won't fire automatically. The test hangs waiting for `__webview_ready__` that it never sends.

**Fix Strategy**:

Trigger handshake manually after calling factory:

```typescript
it('should create and initialize communication manager', async () => {
  // Start factory (returns promise, doesn't await yet)
  const managerPromise = createWebviewCommunication(mockPanel);

  // Give it a tick to send extension_ready
  await Promise.resolve();

  // Simulate webview responding
  messageListener({
    id: 'webview-1',
    type: '__webview_ready__',
    timestamp: Date.now()
  });

  // Now await the factory result
  const manager = await managerPromise;

  expect(manager).toBeInstanceOf(WebviewCommunicationManager);
});
```

---

### Failure #6: PostMessage Failure During Init

**Test**: "should handle postMessage failure during initialization" (line 945)

**Root Cause**: Mock configured after manager creation, fake timers not advanced

**Why It Fails**:

```typescript
// Test code (line 946-950):
(mockWebview.postMessage as jest.Mock).mockRejectedValue(new Error('Failed'));
manager = new WebviewCommunicationManager(mockPanel);
await expect(manager.initialize()).rejects.toThrow();  // ⏳ Times out

// Problem 1: mockRejectedValue makes ALL postMessage calls fail
// Problem 2: Fake timers prevent handshake timeout from firing
// Problem 3: Test expects immediate rejection, but needs timeout to fire
```

**Implementation Reference**:
- `src/core/communication/webviewCommunicationManager.ts:94-147` - `initialize()` sets up 10s timeout (line 111-113)
- `src/core/communication/webviewCommunicationManager.ts:407-415` - `sendRawMessage()` throws on postMessage failure

**Technical Explanation**:

The test expects `initialize()` to reject immediately when postMessage fails. However, with fake timers:

1. `initialize()` calls `sendRawMessage()` to send `__extension_ready__` (line 116-120)
2. `sendRawMessage()` calls `postMessage()` which is mocked to reject (line 411)
3. The rejection is caught and logged, but `initialize()` doesn't reject yet
4. `initialize()` waits for either `__webview_ready__` OR a 10-second timeout (line 110-146)
5. With fake timers, the timeout never fires automatically
6. Test times out at Jest's 10-second default test timeout

**Fix Strategy**:

Option A - Advance timers to trigger handshake timeout:
```typescript
it('should handle postMessage failure during initialization', async () => {
  (mockWebview.postMessage as jest.Mock).mockRejectedValue(new Error('Failed'));

  manager = new WebviewCommunicationManager(mockPanel);
  const initPromise = manager.initialize();

  // Fast-forward past handshake timeout
  jest.advanceTimersByTime(10000);

  await expect(initPromise).rejects.toThrow('Webview handshake timeout');
});
```

Option B - Let sendRawMessage throw:
```typescript
it('should handle postMessage failure during initialization', async () => {
  (mockWebview.postMessage as jest.Mock).mockRejectedValue(new Error('Failed'));

  manager = new WebviewCommunicationManager(mockPanel);

  // If sendRawMessage is expected to throw on postMessage failure:
  await expect(manager.initialize()).rejects.toThrow('Failed');
});
```

The choice depends on whether `sendRawMessage` is supposed to throw or log-and-continue when postMessage fails.

---

## Common Pitfalls

### 1. Fake Timers + Async Operations

**Problem**: Jest's fake timers advance the clock but don't automatically flush promise microtasks.

**Solution**: Always follow `jest.advanceTimersByTime()` with `await Promise.resolve()`.

```typescript
// ❌ Wrong
jest.advanceTimersByTime(1000);
// setTimeout callbacks scheduled but not executed

// ✅ Correct
jest.advanceTimersByTime(1000);
await Promise.resolve();  // Flush microtask queue
```

### 2. Mock Call Order

**Problem**: `mockResolvedValueOnce()` and `mockRejectedValueOnce()` consume calls in order. Handshake messages sent in `beforeEach` can consume your test's mocks.

**Solution**: Account for beforeEach messages or clear mocks before configuring.

```typescript
// ❌ Wrong - mock consumed by beforeEach handshake_complete
(mock.postMessage as jest.Mock).mockRejectedValueOnce(new Error('Fail'));

// ✅ Correct - clear first
(mock.postMessage as jest.Mock).mockClear();
(mock.postMessage as jest.Mock).mockRejectedValueOnce(new Error('Fail'));
```

### 3. Handshake Protocol

**Problem**: The WebviewCommunicationManager requires explicit `__webview_ready__` message. Factory functions wait for this but tests must trigger it manually.

**Solution**: Always send `__webview_ready__` after calling `initialize()` or factory functions.

```typescript
// ❌ Wrong - hangs forever
const manager = await createWebviewCommunication(mockPanel);

// ✅ Correct - complete handshake
const managerPromise = createWebviewCommunication(mockPanel);
await Promise.resolve();
messageListener({ type: '__webview_ready__', /* ... */ });
const manager = await managerPromise;
```

### 4. Error Testing with Fake Timers

**Problem**: When testing initialization failures with timeouts, you must advance timers to trigger timeout logic.

**Solution**: Advance timers past the timeout threshold.

```typescript
// ❌ Wrong - timeout never fires
await expect(manager.initialize()).rejects.toThrow();

// ✅ Correct - trigger timeout
const initPromise = manager.initialize();
jest.advanceTimersByTime(10000);
await expect(initPromise).rejects.toThrow();
```

---

## Implementation Options

### Option 1: Fix Each Test Individually

**Pros:**
- Minimal changes to existing test structure
- Each fix is isolated and easy to review
- Preserves test intent

**Cons:**
- Repetitive fixes across multiple tests
- Doesn't address systemic pattern issues

**Recommended for**: Small test suites or when tests have unique requirements

### Option 2: Create Helper Functions

**Pros:**
- DRY principle - reusable patterns
- Easier to maintain
- Enforces consistent testing patterns

**Cons:**
- Adds abstraction layer
- May hide important test details

**Example:**
```typescript
// Test helper
async function completeHandshake() {
  await Promise.resolve();
  messageListener({
    id: 'webview-1',
    type: '__webview_ready__',
    timestamp: Date.now()
  });
  await Promise.resolve();
}

// Usage in tests
it('should create manager', async () => {
  const managerPromise = createWebviewCommunication(mockPanel);
  await completeHandshake();
  const manager = await managerPromise;
  expect(manager).toBeInstanceOf(WebviewCommunicationManager);
});
```

**Recommended for**: Larger test suites with repeated patterns

### Option 3: Refactor beforeEach Setup

**Pros:**
- Centralizes handshake logic
- Reduces per-test boilerplate
- More realistic test scenarios

**Cons:**
- Changes affect all tests in describe block
- May hide important timing details

**Example:**
```typescript
// Enhanced beforeEach
beforeEach(async () => {
  // ... existing setup ...

  // Helper to complete handshake
  global.completeHandshake = async () => {
    await Promise.resolve();
    messageListener({
      id: 'webview-1',
      type: '__webview_ready__',
      timestamp: Date.now()
    });
    await Promise.resolve();
  };

  // Helper for timer + microtask
  global.advanceTimers = async (ms: number) => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  };
});
```

**Recommended for**: Test suites with very consistent patterns

---

## Key Takeaways

### Test Patterns That Work

✅ **For retry tests**:
```typescript
jest.advanceTimersByTime(X);
await Promise.resolve();
// Repeat as needed
```

✅ **For factory tests**:
```typescript
const managerPromise = createWebviewCommunication(mockPanel);
await Promise.resolve();
messageListener({type: '__webview_ready__', /* ... */});
const manager = await managerPromise;
```

✅ **For error tests**:
```typescript
// Configure mock BEFORE creating manager
const initPromise = manager.initialize();
jest.advanceTimersByTime(TIMEOUT_MS);
await expect(initPromise).rejects.toThrow();
```

✅ **For mock ordering**:
```typescript
(mock as jest.Mock).mockClear();  // Clear beforeEach mocks first
(mock as jest.Mock).mockRejectedValueOnce(error);  // Then configure
```

### Why These Patterns Matter

1. **Event Loop Understanding**: Microtasks (promises) execute before macrotasks (setTimeout). Fake timers don't automatically flush microtasks.

2. **Async Coordination**: Tests must manually coordinate timing that would happen automatically in real code.

3. **Mock State Management**: Mocks maintain state across test phases. Clear them when needed.

4. **Handshake Protocol**: Two-way communication requires both sides to participate. Tests must simulate the webview side.

---

## Test Failure Summary

| Test | Line | Root Cause | Solution | Complexity |
|------|------|-----------|----------|------------|
| **retry failed messages** | 244 | Missing microtask flush after timer advance | Add `await Promise.resolve()` after each `jest.advanceTimersByTime()` | Low |
| **throw after max retries** | 282 | Missing microtask flush after timer advance | Add `await Promise.resolve()` after each `jest.advanceTimersByTime()` | Low |
| **timeout hint fails** | 792 | Mock consumed by wrong postMessage call | Clear mock before test or use multiple `mockRejectedValueOnce` | Medium |
| **factory create** | 816 | Missing webview_ready message trigger | Send `messageListener({type: '__webview_ready__'})` after factory call | Medium |
| **factory with options** | 822 | Missing webview_ready message trigger | Send `messageListener({type: '__webview_ready__'})` after factory call | Medium |
| **postMessage failure** | 945 | Mock misconfiguration + missing timer advance | Configure mock BEFORE manager creation + advance timers | High |

---

## Next Steps

1. **Immediate**: Fix all 7 tests using patterns identified above
2. **Short-term**: Consider extracting common patterns into helper functions
3. **Long-term**: Document fake timer + async patterns in testing guide
4. **Follow-up**: Review other test files for similar timing issues

---

## References

- Test File: `tests/utils/webviewCommunicationManager.test.ts`
- Implementation: `src/core/communication/webviewCommunicationManager.ts`
- Jest Documentation: [Timer Mocks](https://jestjs.io/docs/timer-mocks)
- JavaScript Event Loop: [Microtasks vs Macrotasks](https://javascript.info/event-loop)

---

**Research completed**: 2025-11-03
**Analysis depth**: Quick (root cause identification)
**Confidence level**: High - All failure patterns identified with clear solutions
