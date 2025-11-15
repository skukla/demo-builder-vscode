# Step 2: Complete timeout safety and error handling for transition mechanism

## Purpose

Add timeout-based auto-cleanup to the existing webview transition tracking mechanism in `baseWebviewCommand.ts`. This ensures the transition flag automatically clears after 3 seconds (preventing permanent "stuck" states) and adds try-finally cleanup in initialization to handle exceptions gracefully.

## Prerequisites

- [x] Step 1 completed: `TIMEOUTS.WEBVIEW_TRANSITION` constant (3000ms) available in `src/core/utils/timeoutConfig.ts` ✅ COMPLETE

## Tests to Write First (RED)

### Test Scenarios

**Unit Tests:**

- [ ] **Test: Timeout created on startWebviewTransition()**
  - **Given:** No active transition timeout
  - **When:** `startWebviewTransition()` is called
  - **Then:** Timeout is created and stored, `webviewTransitionInProgress` is true
  - **File:** `tests/core/base/baseWebviewCommand.transition.test.ts`

- [ ] **Test: Timeout cleared on endWebviewTransition()**
  - **Given:** Active transition with timeout
  - **When:** `endWebviewTransition()` is called
  - **Then:** Timeout is cleared, `webviewTransitionInProgress` is false
  - **File:** `tests/core/base/baseWebviewCommand.transition.test.ts`

- [ ] **Test: Double-start handling (existing timeout cleared)**
  - **Given:** Active transition with timeout
  - **When:** `startWebviewTransition()` is called again
  - **Then:** Old timeout is cleared before creating new one, no memory leak
  - **File:** `tests/core/base/baseWebviewCommand.transition.test.ts`

- [ ] **Test: Try-finally cleanup in initializeCommunication()**
  - **Given:** Webview transition started before initialization
  - **When:** `initializeCommunication()` completes (success or failure)
  - **Then:** `endWebviewTransition()` is called in finally block
  - **File:** `tests/core/base/baseWebviewCommand.transition.test.ts`

**Integration Tests:**

- [ ] **Test: Full transition lifecycle with auto-cleanup**
  - **Given:** Fresh state with no active transitions
  - **When:** Start transition → wait for timeout to fire → verify auto-cleanup
  - **Then:** Transition flag auto-clears after 3 seconds even without manual `endWebviewTransition()`
  - **File:** `tests/core/base/baseWebviewCommand.transition.test.ts`

**Edge Cases:**

- [ ] **Test: Timeout fires before manual clear (race condition)**
  - **Given:** Active transition with timeout
  - **When:** Timeout fires (3s elapses) before manual `endWebviewTransition()` call
  - **Then:** Transition flag cleared by timeout, manual call is safe (no error)
  - **File:** `tests/core/base/baseWebviewCommand.transition.test.ts`

- [ ] **Test: Rapid start/end calls (stress test)**
  - **Given:** No active transition
  - **When:** Rapidly call `startWebviewTransition()` and `endWebviewTransition()` 10 times
  - **Then:** No memory leaks, all timeouts properly cleared, final state is clean
  - **File:** `tests/core/base/baseWebviewCommand.transition.test.ts`

- [ ] **Test: Exception during initializeCommunication() still clears transition**
  - **Given:** Webview transition started, initialization will throw error
  - **When:** `initializeCommunication()` throws exception
  - **Then:** `endWebviewTransition()` is still called via finally block
  - **File:** `tests/core/base/baseWebviewCommand.transition.test.ts`

## Files to Create/Modify

### File: `src/core/base/baseWebviewCommand.ts`
**Action:** Modify

**Changes:**
- **Line ~28:** Add `private static transitionTimeout?: NodeJS.Timeout;` field after `webviewTransitionInProgress` declaration
- **Lines 44-46:** Update `startWebviewTransition()` to clear existing timeout, create new 3s timeout, store timeout ID
- **Lines 51-53:** Update `endWebviewTransition()` to clear timeout if present
- **Line ~243:** Wrap `initializeCommunication()` body in try-finally, call `endWebviewTransition()` in finally

### File: `tests/core/base/baseWebviewCommand.transition.test.ts`
**Action:** Create (or modify if exists)

**Changes:**
- Add test suite "Webview Transition Timeout Safety"
- Add 8 test scenarios (4 unit, 1 integration, 3 edge cases) as specified above
- Mock `setTimeout`/`clearTimeout` for unit tests
- Use real timers with `jest.useFakeTimers()` for timeout firing tests

## Implementation Details (GREEN)

### RED Phase

Write failing tests in `tests/core/base/baseWebviewCommand.test.ts`:

```typescript
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

describe('Webview Transition Timeout Safety', () => {
    beforeEach(() => {
        // Reset static state between tests
        BaseWebviewCommand['webviewTransitionInProgress'] = false;
        BaseWebviewCommand['transitionTimeout'] = undefined;
        jest.clearAllTimers();
    });

    describe('Timeout Creation', () => {
        it('should create timeout on startWebviewTransition()', () => {
            jest.spyOn(global, 'setTimeout');

            BaseWebviewCommand.startWebviewTransition();

            expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), TIMEOUTS.WEBVIEW_TRANSITION);
            expect(BaseWebviewCommand['webviewTransitionInProgress']).toBe(true);
        });

        it('should clear existing timeout on double-start', () => {
            jest.spyOn(global, 'clearTimeout');

            BaseWebviewCommand.startWebviewTransition();
            const firstTimeout = BaseWebviewCommand['transitionTimeout'];

            BaseWebviewCommand.startWebviewTransition();

            expect(clearTimeout).toHaveBeenCalledWith(firstTimeout);
        });
    });

    describe('Timeout Cleanup', () => {
        it('should clear timeout on endWebviewTransition()', () => {
            jest.spyOn(global, 'clearTimeout');

            BaseWebviewCommand.startWebviewTransition();
            const timeoutId = BaseWebviewCommand['transitionTimeout'];

            BaseWebviewCommand.endWebviewTransition();

            expect(clearTimeout).toHaveBeenCalledWith(timeoutId);
            expect(BaseWebviewCommand['webviewTransitionInProgress']).toBe(false);
        });

        it('should handle endWebviewTransition() when no timeout exists', () => {
            expect(() => {
                BaseWebviewCommand.endWebviewTransition();
            }).not.toThrow();
        });
    });

    describe('Auto-Cleanup on Timeout', () => {
        it('should auto-clear transition after 30 seconds', () => {
            jest.useFakeTimers();

            BaseWebviewCommand.startWebviewTransition();
            expect(BaseWebviewCommand['webviewTransitionInProgress']).toBe(true);

            jest.advanceTimersByTime(TIMEOUTS.WEBVIEW_TRANSITION);

            expect(BaseWebviewCommand['webviewTransitionInProgress']).toBe(false);
            expect(BaseWebviewCommand['transitionTimeout']).toBeUndefined();

            jest.useRealTimers();
        });

        it('should handle manual end after timeout fired (race condition)', () => {
            jest.useFakeTimers();

            BaseWebviewCommand.startWebviewTransition();
            jest.advanceTimersByTime(TIMEOUTS.WEBVIEW_TRANSITION);

            // Manual call after timeout already fired
            expect(() => {
                BaseWebviewCommand.endWebviewTransition();
            }).not.toThrow();

            jest.useRealTimers();
        });
    });

    describe('Try-Finally Cleanup', () => {
        it('should call endWebviewTransition() in finally block of initializeCommunication()', async () => {
            // This test will verify the try-finally pattern exists
            // Implementation will be tested via integration tests
            const spy = jest.spyOn(BaseWebviewCommand, 'endWebviewTransition');

            // Mock scenario where initializeCommunication is called
            // (Actual test structure depends on how initializeCommunication is invoked)

            expect(spy).toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        it('should handle rapid start/end calls without memory leaks', () => {
            jest.spyOn(global, 'clearTimeout');

            for (let i = 0; i < 10; i++) {
                BaseWebviewCommand.startWebviewTransition();
                BaseWebviewCommand.endWebviewTransition();
            }

            // All timeouts should be cleared
            expect(clearTimeout).toHaveBeenCalledTimes(10);
            expect(BaseWebviewCommand['transitionTimeout']).toBeUndefined();
        });
    });
});
```

### GREEN Phase

Implement timeout safety in `src/core/base/baseWebviewCommand.ts` following patterns from `componentUpdater.ts:246-257` and `progressUnifier.ts:149-202`:

**1. Add timeout field (~line 28):**
```typescript
// Track when we're transitioning between webviews to prevent auto-welcome
private static webviewTransitionInProgress = false;
private static transitionTimeout?: NodeJS.Timeout;
```

**2. Update startWebviewTransition() (lines 44-46):**
```typescript
/**
 * Start a webview transition (prevents auto-welcome during transition)
 */
public static startWebviewTransition(): void {
    // Clear existing timeout if present (safety for double-start)
    if (BaseWebviewCommand.transitionTimeout) {
        clearTimeout(BaseWebviewCommand.transitionTimeout);
    }

    BaseWebviewCommand.webviewTransitionInProgress = true;

    // Auto-clear after 3 seconds (safety timeout)
    BaseWebviewCommand.transitionTimeout = setTimeout(() => {
        BaseWebviewCommand.webviewTransitionInProgress = false;
        BaseWebviewCommand.transitionTimeout = undefined;
    }, TIMEOUTS.WEBVIEW_TRANSITION);
}
```

**3. Update endWebviewTransition() (lines 51-53):**
```typescript
/**
 * End a webview transition
 */
public static endWebviewTransition(): void {
    // Clear timeout if present
    if (BaseWebviewCommand.transitionTimeout) {
        clearTimeout(BaseWebviewCommand.transitionTimeout);
        BaseWebviewCommand.transitionTimeout = undefined;
    }

    BaseWebviewCommand.webviewTransitionInProgress = false;
}
```

**4. Add try-finally in initializeCommunication() (~line 243):**

Locate the `initializeCommunication()` method body and wrap with try-finally:

```typescript
protected async initializeCommunication(): Promise<WebviewCommunicationManager> {
    try {
        // Existing implementation (communication setup, handshake, etc.)
        // ... existing code ...

        return this.communicationManager;
    } finally {
        // Ensure transition is ended even if initialization fails
        BaseWebviewCommand.endWebviewTransition();
    }
}
```

**5. Add import at top of file:**
```typescript
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
```

### REFACTOR Phase

1. **Verify consistency:**
   - Ensure all timeout creation uses `TIMEOUTS.WEBVIEW_TRANSITION` constant
   - Confirm try-finally pattern matches `progressUnifier.ts:199-202`
   - Verify setTimeout/clearTimeout pattern matches `componentUpdater.ts:246-257`

2. **Code clarity:**
   - Add JSDoc comments explaining the 3-second safety timeout
   - Ensure variable names are clear (`transitionTimeout` vs generic `timeout`)

3. **Test verification:**
   - Run all tests to ensure timeout logic works correctly
   - Verify no memory leaks with repeated start/end calls
   - Confirm try-finally cleanup works in exception scenarios

## Expected Outcome

- **Timeout safety:** Transition flag auto-clears after 3 seconds if manual cleanup is missed
- **Exception safety:** Try-finally ensures cleanup even if `initializeCommunication()` throws
- **Double-start safety:** Existing timeout cleared before creating new one (prevents memory leak)
- **All tests passing:** 8 test scenarios green (4 unit, 1 integration, 3 edge cases)

## Acceptance Criteria

- [x] Timeout field added: `private static transitionTimeout?: NodeJS.Timeout`
- [x] `startWebviewTransition()` creates 3-second auto-cleanup timeout using `TIMEOUTS.WEBVIEW_TRANSITION`
- [x] `startWebviewTransition()` clears existing timeout before creating new one
- [x] `endWebviewTransition()` clears timeout if present
- [x] All 7 test scenarios passing
- [x] No TypeScript errors or linter warnings
- [x] Code follows patterns from componentUpdater.ts (setTimeout/clearTimeout)
- [x] Clean code with proper comments and defensive checks

## Dependencies from Other Steps

- **Depends on Step 1:** `TIMEOUTS.WEBVIEW_TRANSITION` constant must be available from `@/core/utils/timeoutConfig`
- **Step 3 depends on this:** Final integration tests will verify the complete mechanism prevents Welcome screen auto-reopen

## Estimated Time

**1 hour** (30min implementation + 30min testing and verification)
