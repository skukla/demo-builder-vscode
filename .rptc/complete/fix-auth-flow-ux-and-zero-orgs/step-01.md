# Step 1: Fix UX Message Flash

## Purpose

Remove the optimistic "Opening browser for Adobe authentication..." message that appears before the backend determines the actual authentication path. This message causes a confusing flash because:

1. Frontend sets "Opening browser..." immediately on button click (line 137)
2. Backend may respond with different message (e.g., "Already authenticated, selecting organization...")
3. User sees brief flash of wrong message before correct message appears

By clearing the message instead of setting optimistic text, the backend's first status update provides accurate information immediately.

## Prerequisites

- [ ] Context loaded from overview.md and feature research
- [ ] Development environment ready with TypeScript watch mode
- [ ] Test environment configured for React component testing

## Tests to Write First (RED Phase)

### Unit Tests

- [ ] **Test: handleLogin() sets authStatus to empty string, not optimistic message**
  - **Given:** AdobeAuthStep component mounted with initial state
  - **When:** User clicks "Sign In with Adobe" button (calls handleLogin(false))
  - **Then:** authStatus state is set to empty string `''`, NOT "Opening browser for Adobe authentication..."
  - **File:** `tests/features/authentication/ui/steps/AdobeAuthStep.test.tsx`

- [ ] **Test: handleLogin() clears authSubMessage**
  - **Given:** AdobeAuthStep component with existing authSubMessage from previous operation
  - **When:** User clicks "Sign In with Adobe" button
  - **Then:** authSubMessage state is set to empty string `''`
  - **File:** `tests/features/authentication/ui/steps/AdobeAuthStep.test.tsx`

- [ ] **Test: handleLogin() does NOT set "Opening browser..." text**
  - **Given:** AdobeAuthStep component mounted
  - **When:** handleLogin() is called (via button click or forced re-auth)
  - **Then:** The text "Opening browser for Adobe authentication..." does NOT appear in component state
  - **File:** `tests/features/authentication/ui/steps/AdobeAuthStep.test.tsx`

- [ ] **Test: Backend auth-status message displays correctly after handleLogin()**
  - **Given:** handleLogin() called, authStatus cleared to empty string
  - **When:** Backend sends auth-status message with custom message "Verifying token..."
  - **Then:** Component displays backend message "Verifying token..." (proving empty state allows backend to control first message)
  - **File:** `tests/features/authentication/ui/steps/AdobeAuthStep.test.tsx`

### Integration Tests

No integration tests required for this step - unit tests cover the message state behavior completely.

## Files to Create/Modify

**Files to Modify:**

- [ ] `src/features/authentication/ui/steps/AdobeAuthStep.tsx` - Change line 137 from setting optimistic message to clearing message state

**Test Files:**

- [ ] `tests/features/authentication/ui/steps/AdobeAuthStep.test.tsx` - Add new test cases for handleLogin message behavior

## Implementation Details (RED-GREEN-REFACTOR)

### RED: Write Failing Tests First

**Add new test suite section to AdobeAuthStep.test.tsx:**

```typescript
describe('UX Message Flash Fix - handleLogin() Message Behavior', () => {
    it('should set authStatus to empty string when Sign In clicked, not optimistic message', () => {
        const state = {
            ...baseState,
            adobeAuth: { isAuthenticated: false, isChecking: false },
        };

        const { rerender } = render(
            <AdobeAuthStep
                state={state as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        const signInButton = screen.getByText('Sign In with Adobe');
        fireEvent.click(signInButton);

        // Verify authStatus is cleared (empty string), NOT set to optimistic message
        // Note: Component uses internal state for authStatus, check via loading display
        expect(screen.queryByText('Opening browser for Adobe authentication...')).not.toBeInTheDocument();
    });

    it('should clear authSubMessage when handleLogin() called', async () => {
        let messageCallback: (data: any) => void = () => {};
        mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
            if (type === 'auth-status') {
                messageCallback = callback;
            }
            return jest.fn();
        });

        const state = {
            ...baseState,
            adobeAuth: { isAuthenticated: false, isChecking: false },
        };

        render(
            <AdobeAuthStep
                state={state as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        // Simulate existing subMessage from previous operation
        messageCallback({
            isChecking: false,
            isAuthenticated: false,
            message: 'Previous message',
            subMessage: 'Previous sub-message',
        });

        await waitFor(() => {
            expect(screen.getByText('Previous sub-message')).toBeInTheDocument();
        });

        // Click Sign In - should clear messages
        const signInButton = screen.getByText('Sign In with Adobe');
        fireEvent.click(signInButton);

        // Sub-message should be cleared
        expect(screen.queryByText('Previous sub-message')).not.toBeInTheDocument();
    });

    it('should allow backend to control first message when authStatus is empty', async () => {
        let messageCallback: (data: any) => void = () => {};
        mockOnMessage.mockImplementation((type: string, callback: (data: any) => void) => {
            if (type === 'auth-status') {
                messageCallback = callback;
            }
            return jest.fn();
        });

        const state = {
            ...baseState,
            adobeAuth: { isAuthenticated: false, isChecking: false },
        };

        render(
            <AdobeAuthStep
                state={state as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        // Click Sign In
        const signInButton = screen.getByText('Sign In with Adobe');
        fireEvent.click(signInButton);

        // Simulate backend sending accurate first message
        messageCallback({
            isChecking: true,
            isAuthenticated: false,
            message: 'Already authenticated, selecting organization...',
            subMessage: 'Please choose your organization',
        });

        // Backend message should display (proving no optimistic message conflict)
        await waitFor(() => {
            expect(screen.getByText('Already authenticated, selecting organization...')).toBeInTheDocument();
        });
    });

    it('should not display "Opening browser..." at any point during login flow', () => {
        const state = {
            ...baseState,
            adobeAuth: { isAuthenticated: false, isChecking: false },
        };

        render(
            <AdobeAuthStep
                state={state as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        const signInButton = screen.getByText('Sign In with Adobe');
        fireEvent.click(signInButton);

        // The optimistic message should NEVER appear
        expect(screen.queryByText('Opening browser for Adobe authentication...')).not.toBeInTheDocument();
        expect(screen.queryByText(/Opening browser/i)).not.toBeInTheDocument();
    });
});
```

**Run tests to verify they fail:**

```bash
npm run test:watch -- tests/features/authentication/ui/steps/AdobeAuthStep.test.tsx
```

**Expected result:** Tests FAIL because line 137 currently sets optimistic message.

### GREEN: Minimal Implementation

**Modify AdobeAuthStep.tsx:**

**File:** `src/features/authentication/ui/steps/AdobeAuthStep.tsx`

**Change line 137 from:**

```typescript
setAuthStatus('Opening browser for Adobe authentication...');
```

**To:**

```typescript
setAuthStatus('');
```

**Full context of the change (lines 128-138):**

```typescript
const handleLogin = (force: boolean = false) => {
    // Clear any existing timeout
    if (authTimeoutRef.current) {
        clearTimeout(authTimeoutRef.current);
        authTimeoutRef.current = null;
    }

    // Reset timeout state and clear old messages
    setAuthTimeout(false);
    setAuthStatus(''); // ← CHANGED: Clear message instead of setting optimistic text
    setAuthSubMessage('');
```

**Verify minimal change:**

- Only 1 line changed
- No other logic modified
- Comment updated to reflect clearing behavior

**Run tests to verify they pass:**

```bash
npm run test:watch -- tests/features/authentication/ui/steps/AdobeAuthStep.test.tsx
```

**Expected result:** All new tests PASS (GREEN).

### REFACTOR: Clean Up

**1. Update inline comment for clarity:**

**Line 135-137 (after change):**

```typescript
// Reset timeout state and clear old messages to let backend send accurate first message
setAuthTimeout(false);
setAuthStatus('');
setAuthSubMessage('');
```

**2. Verify existing tests still pass:**

Run full test suite for this component:

```bash
npm run test:watch -- tests/features/authentication/ui/steps/AdobeAuthStep.test.tsx
```

**Expected:** All 50+ existing tests PASS (no regressions).

**3. Verify no unintended side effects:**

Check that:
- [ ] Loading display still shows when `isChecking` is true
- [ ] Backend messages still display correctly via auth-status handler
- [ ] Error states still display appropriately
- [ ] Timeout handling still works

**4. Manual verification:**

Start extension in debug mode (F5), test authentication flow:

1. Click "Sign In with Adobe" - should NOT see "Opening browser..." flash
2. Backend message should appear immediately (e.g., "Launching browser..." or "Already authenticated...")
3. No confusing message transitions

## Expected Outcome

**Behavior After This Step:**

- Clicking "Sign In with Adobe" button clears message state immediately
- No optimistic "Opening browser..." message appears
- Backend's first auth-status update provides accurate UX message
- User sees consistent, truthful messaging throughout authentication

**Verification:**

- [ ] All 4 new tests pass
- [ ] All existing AdobeAuthStep tests pass (50+ tests)
- [ ] Manual testing shows no message flash
- [ ] Backend messages display immediately and accurately

**What Works:**

- handleLogin() clears authStatus and authSubMessage
- Backend controls all UX messaging via auth-status handler
- No confusing flash of "Opening browser..." before actual operation message

**What Doesn't Change:**

- Auth flow logic remains identical
- Loading states still work via `isChecking` flag
- Error handling and timeout behavior unchanged

## Acceptance Criteria

- [ ] handleLogin() sets authStatus to empty string (not "Opening browser...")
- [ ] handleLogin() clears authSubMessage to empty string
- [ ] No "Opening browser for Adobe authentication..." text appears in UI during login flow
- [ ] Backend auth-status messages display immediately without flash
- [ ] All 4 new unit tests passing
- [ ] All existing AdobeAuthStep tests passing (no regressions)
- [ ] No console errors or warnings in browser
- [ ] Code follows project React/TypeScript conventions
- [ ] Inline comment updated to reflect clearing behavior

## Dependencies from Other Steps

**None** - This step is independent and can be implemented first.

**Later steps depend on this:**
- Step 2 (backend validation) assumes frontend defers messaging to backend
- Step 3 (CLI context clearing) builds on accurate backend messaging

## Estimated Time

**30-45 minutes**

- 10 min: Write 4 failing tests (RED)
- 5 min: Implement 1-line fix (GREEN)
- 10 min: Verify existing tests, update comment (REFACTOR)
- 10 min: Manual verification and acceptance criteria check
- 5 min: Buffer for unexpected issues

**Total:** 40 minutes (conservative estimate)
