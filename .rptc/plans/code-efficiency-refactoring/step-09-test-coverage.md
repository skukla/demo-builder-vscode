# Step 9: Test Coverage Improvements - Detailed Implementation Plan

## Overview

Close test coverage gaps identified in the research phase, focusing on critical infrastructure components, feature-specific hooks, and error scenarios.

**Estimated Effort:** 20-25 hours
**Risk Level:** Low (adding tests, not changing code)
**Dependencies:** Steps 5-7 (test new hooks/interfaces if created)

---

## Current State Analysis

### Test Coverage Summary

| Category | Coverage | Tests | Status |
|----------|----------|-------|--------|
| Shared Hooks | 100% | 17/17 | ✅ Complete |
| Feature Hooks | 100% | 6/6 | ✅ Complete |
| Core UI Components | **38%** | 10/26 | ❌ Major gap |
| Feature UI Steps | 87% | ~26/30 | ⚠️ Some gaps |
| Error Scenarios | ~60% | Varies | ⚠️ Needs work |

### Critical Missing Tests

| Component | Priority | Impact | Effort |
|-----------|----------|--------|--------|
| ErrorBoundary.tsx | CRITICAL | Extension-wide error handling | 2-3h |
| WebviewApp.tsx | CRITICAL | Main app entry point | 2-3h |
| Modal.tsx | HIGH | Frequently used UI element | 2-3h |
| useAuthStatus (unit) | HIGH | Auth logic isolation | 1.5h |
| useConfigNavigation (unit) | HIGH | Config navigation | 1.5h |
| ComponentConfigStep.tsx | MEDIUM | Feature step | 2.5h |
| FadeTransition.tsx | LOW | Animation component | 1h |

---

## Implementation Plan

### Phase 1: Critical Infrastructure Tests (Priority: CRITICAL)

#### 1.1 ErrorBoundary.tsx Tests

**File:** `tests/core/ui/components/ErrorBoundary.test.tsx`

**Why Critical:** Handles errors for the entire extension UI. If it fails, users see nothing.

```typescript
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/core/ui/components/ErrorBoundary';

// Test component that throws
const ThrowingComponent: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow }) => {
    if (shouldThrow) {
        throw new Error('Test error');
    }
    return <div>Normal content</div>;
};

describe('ErrorBoundary', () => {
    // Suppress console.error for expected errors
    const originalError = console.error;
    beforeAll(() => {
        console.error = jest.fn();
    });
    afterAll(() => {
        console.error = originalError;
    });

    describe('normal rendering', () => {
        it('renders children when no error occurs', () => {
            render(
                <ErrorBoundary>
                    <div>Test content</div>
                </ErrorBoundary>
            );

            expect(screen.getByText('Test content')).toBeInTheDocument();
        });

        it('does not show fallback UI when no error', () => {
            render(
                <ErrorBoundary fallback={<div>Error occurred</div>}>
                    <div>Normal content</div>
                </ErrorBoundary>
            );

            expect(screen.queryByText('Error occurred')).not.toBeInTheDocument();
        });
    });

    describe('error handling', () => {
        it('catches errors and renders fallback UI', () => {
            render(
                <ErrorBoundary fallback={<div>Something went wrong</div>}>
                    <ThrowingComponent shouldThrow />
                </ErrorBoundary>
            );

            expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        });

        it('renders default error UI when no fallback provided', () => {
            render(
                <ErrorBoundary>
                    <ThrowingComponent shouldThrow />
                </ErrorBoundary>
            );

            expect(screen.getByText(/error/i)).toBeInTheDocument();
        });

        it('calls onError callback when error occurs', () => {
            const onError = jest.fn();

            render(
                <ErrorBoundary onError={onError}>
                    <ThrowingComponent shouldThrow />
                </ErrorBoundary>
            );

            expect(onError).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ componentStack: expect.any(String) })
            );
        });

        it('passes error to fallback render prop', () => {
            render(
                <ErrorBoundary
                    fallback={(error) => <div>Error: {error.message}</div>}
                >
                    <ThrowingComponent shouldThrow />
                </ErrorBoundary>
            );

            expect(screen.getByText('Error: Test error')).toBeInTheDocument();
        });
    });

    describe('error recovery', () => {
        it('recovers when children no longer throw', () => {
            const { rerender } = render(
                <ErrorBoundary>
                    <ThrowingComponent shouldThrow />
                </ErrorBoundary>
            );

            expect(screen.getByText(/error/i)).toBeInTheDocument();

            // Note: ErrorBoundary typically needs resetErrorBoundary or key change
            // Test actual recovery mechanism used in implementation
        });
    });

    describe('nested error boundaries', () => {
        it('catches error at nearest boundary', () => {
            render(
                <ErrorBoundary fallback={<div>Outer error</div>}>
                    <div>
                        <ErrorBoundary fallback={<div>Inner error</div>}>
                            <ThrowingComponent shouldThrow />
                        </ErrorBoundary>
                    </div>
                </ErrorBoundary>
            );

            expect(screen.getByText('Inner error')).toBeInTheDocument();
            expect(screen.queryByText('Outer error')).not.toBeInTheDocument();
        });
    });
});
```

**Estimated Lines:** ~150

#### 1.2 WebviewApp.tsx Tests

**File:** `tests/core/ui/components/WebviewApp.test.tsx`

**Why Critical:** Entry point for all webview UIs. Context providers, theme setup, message protocol.

```typescript
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { WebviewApp } from '@/core/ui/components/WebviewApp';
import { VSCodeContext } from '@/core/ui/contexts/VSCodeContext';
import { ThemeContext } from '@/core/ui/contexts/ThemeContext';

// Mock VS Code API
const mockVSCodeApi = {
    postMessage: jest.fn(),
    getState: jest.fn(() => null),
    setState: jest.fn(),
};

// Mock window.acquireVsCodeApi
beforeAll(() => {
    (window as any).acquireVsCodeApi = () => mockVSCodeApi;
});

describe('WebviewApp', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('initialization', () => {
        it('renders children after initialization', async () => {
            render(
                <WebviewApp>
                    <div>App content</div>
                </WebviewApp>
            );

            await waitFor(() => {
                expect(screen.getByText('App content')).toBeInTheDocument();
            });
        });

        it('sends ready message on mount', async () => {
            render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            await waitFor(() => {
                expect(mockVSCodeApi.postMessage).toHaveBeenCalledWith(
                    expect.objectContaining({ type: 'ready' })
                );
            });
        });

        it('shows loading state during initialization', () => {
            render(
                <WebviewApp loadingComponent={<div>Loading...</div>}>
                    <div>Content</div>
                </WebviewApp>
            );

            // Initial render shows loading
            expect(screen.getByText('Loading...')).toBeInTheDocument();
        });
    });

    describe('context providers', () => {
        it('provides VSCodeContext to children', async () => {
            const TestChild = () => {
                const context = React.useContext(VSCodeContext);
                return <div>Has context: {context ? 'yes' : 'no'}</div>;
            };

            render(
                <WebviewApp>
                    <TestChild />
                </WebviewApp>
            );

            await waitFor(() => {
                expect(screen.getByText('Has context: yes')).toBeInTheDocument();
            });
        });

        it('provides ThemeContext to children', async () => {
            const TestChild = () => {
                const context = React.useContext(ThemeContext);
                return <div>Theme: {context?.theme || 'none'}</div>;
            };

            render(
                <WebviewApp>
                    <TestChild />
                </WebviewApp>
            );

            await waitFor(() => {
                expect(screen.getByText(/Theme:/)).toBeInTheDocument();
            });
        });
    });

    describe('theme handling', () => {
        it('applies dark theme class when theme is dark', async () => {
            // Simulate theme message
            render(
                <WebviewApp>
                    <div data-testid="content">Content</div>
                </WebviewApp>
            );

            // Trigger theme message
            window.dispatchEvent(new MessageEvent('message', {
                data: { type: 'theme', payload: { theme: 'dark' } }
            }));

            await waitFor(() => {
                expect(document.body).toHaveClass('vscode-dark');
            });
        });
    });

    describe('message handling', () => {
        it('handles initialization data from extension', async () => {
            render(
                <WebviewApp>
                    <div>Content</div>
                </WebviewApp>
            );

            // Simulate init message
            window.dispatchEvent(new MessageEvent('message', {
                data: {
                    type: 'init',
                    payload: { theme: 'light', data: { test: true } }
                }
            }));

            await waitFor(() => {
                expect(screen.getByText('Content')).toBeInTheDocument();
            });
        });
    });

    describe('error handling', () => {
        it('renders error boundary around children', async () => {
            const ThrowingChild = () => {
                throw new Error('Test error');
            };

            render(
                <WebviewApp>
                    <ThrowingChild />
                </WebviewApp>
            );

            await waitFor(() => {
                expect(screen.getByText(/error/i)).toBeInTheDocument();
            });
        });
    });
});
```

**Estimated Lines:** ~180

#### 1.3 Modal.tsx Tests

**File:** `tests/core/ui/components/ui/Modal.test.tsx`

**Why Important:** Frequently used for confirmations, dialogs, error displays.

```typescript
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { Modal } from '@/core/ui/components/ui/Modal';

const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme}>
            {ui}
        </Provider>
    );
};

describe('Modal', () => {
    const defaultProps = {
        isOpen: true,
        onClose: jest.fn(),
        title: 'Test Modal',
        children: <div>Modal content</div>,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('visibility', () => {
        it('renders when isOpen is true', () => {
            renderWithProvider(<Modal {...defaultProps} />);

            expect(screen.getByText('Test Modal')).toBeInTheDocument();
            expect(screen.getByText('Modal content')).toBeInTheDocument();
        });

        it('does not render when isOpen is false', () => {
            renderWithProvider(<Modal {...defaultProps} isOpen={false} />);

            expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
        });
    });

    describe('close interactions', () => {
        it('calls onClose when close button clicked', async () => {
            const user = userEvent.setup();
            const onClose = jest.fn();

            renderWithProvider(<Modal {...defaultProps} onClose={onClose} />);

            const closeButton = screen.getByRole('button', { name: /close/i });
            await user.click(closeButton);

            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('calls onClose when pressing Escape', async () => {
            const user = userEvent.setup();
            const onClose = jest.fn();

            renderWithProvider(<Modal {...defaultProps} onClose={onClose} />);

            await user.keyboard('{Escape}');

            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('does not close on Escape when isDismissable is false', async () => {
            const user = userEvent.setup();
            const onClose = jest.fn();

            renderWithProvider(
                <Modal {...defaultProps} onClose={onClose} isDismissable={false} />
            );

            await user.keyboard('{Escape}');

            expect(onClose).not.toHaveBeenCalled();
        });
    });

    describe('action buttons', () => {
        it('renders primary action button', async () => {
            const user = userEvent.setup();
            const onPrimaryAction = jest.fn();

            renderWithProvider(
                <Modal
                    {...defaultProps}
                    primaryAction={{
                        label: 'Confirm',
                        onPress: onPrimaryAction,
                    }}
                />
            );

            const button = screen.getByRole('button', { name: 'Confirm' });
            await user.click(button);

            expect(onPrimaryAction).toHaveBeenCalledTimes(1);
        });

        it('renders secondary action button', async () => {
            const user = userEvent.setup();
            const onSecondaryAction = jest.fn();

            renderWithProvider(
                <Modal
                    {...defaultProps}
                    secondaryAction={{
                        label: 'Cancel',
                        onPress: onSecondaryAction,
                    }}
                />
            );

            const button = screen.getByRole('button', { name: 'Cancel' });
            await user.click(button);

            expect(onSecondaryAction).toHaveBeenCalledTimes(1);
        });

        it('disables primary action when isPrimaryActionDisabled is true', () => {
            renderWithProvider(
                <Modal
                    {...defaultProps}
                    primaryAction={{
                        label: 'Confirm',
                        onPress: jest.fn(),
                        isDisabled: true,
                    }}
                />
            );

            const button = screen.getByRole('button', { name: 'Confirm' });
            expect(button).toBeDisabled();
        });
    });

    describe('focus management', () => {
        it('traps focus within modal', async () => {
            const user = userEvent.setup();

            renderWithProvider(
                <Modal
                    {...defaultProps}
                    primaryAction={{ label: 'OK', onPress: jest.fn() }}
                />
            );

            // Tab through modal elements
            await user.tab();
            await user.tab();
            await user.tab();

            // Focus should stay within modal
            const modal = screen.getByRole('dialog');
            expect(modal.contains(document.activeElement)).toBe(true);
        });

        it('returns focus to trigger element on close', async () => {
            const user = userEvent.setup();
            const triggerRef = React.createRef<HTMLButtonElement>();

            const { rerender } = render(
                <Provider theme={defaultTheme}>
                    <button ref={triggerRef}>Open</button>
                    <Modal {...defaultProps} />
                </Provider>
            );

            // Focus trigger, then close modal
            triggerRef.current?.focus();

            rerender(
                <Provider theme={defaultTheme}>
                    <button ref={triggerRef}>Open</button>
                    <Modal {...defaultProps} isOpen={false} />
                </Provider>
            );

            // Focus should return to trigger
            expect(document.activeElement).toBe(triggerRef.current);
        });
    });

    describe('accessibility', () => {
        it('has correct ARIA attributes', () => {
            renderWithProvider(<Modal {...defaultProps} />);

            const dialog = screen.getByRole('dialog');
            expect(dialog).toHaveAttribute('aria-modal', 'true');
            expect(dialog).toHaveAttribute('aria-labelledby');
        });

        it('associates title with dialog via aria-labelledby', () => {
            renderWithProvider(<Modal {...defaultProps} />);

            const dialog = screen.getByRole('dialog');
            const labelId = dialog.getAttribute('aria-labelledby');
            const title = document.getElementById(labelId!);

            expect(title).toHaveTextContent('Test Modal');
        });
    });

    describe('loading state', () => {
        it('shows loading indicator when isLoading is true', () => {
            renderWithProvider(<Modal {...defaultProps} isLoading />);

            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('disables actions when loading', () => {
            renderWithProvider(
                <Modal
                    {...defaultProps}
                    isLoading
                    primaryAction={{ label: 'OK', onPress: jest.fn() }}
                />
            );

            const button = screen.getByRole('button', { name: 'OK' });
            expect(button).toBeDisabled();
        });
    });
});
```

**Estimated Lines:** ~200

---

### Phase 2: Hook Unit Tests (Priority: HIGH)

#### 2.1 useAuthStatus Unit Tests

**File:** `tests/features/authentication/ui/hooks/useAuthStatus.test.ts`

```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuthStatus } from '@/features/authentication/ui/hooks/useAuthStatus';

// Mock dependencies
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    getWebviewClient: () => mockWebviewClient,
}));

const mockWebviewClient = {
    request: jest.fn(),
    onMessage: jest.fn(() => jest.fn()),
};

describe('useAuthStatus', () => {
    const defaultProps = {
        updateState: jest.fn(),
        setCanProceed: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('initial state', () => {
        it('starts in not-authenticated state', () => {
            const { result } = renderHook(() => useAuthStatus(defaultProps));

            expect(result.current.isAuthenticated).toBe(false);
            expect(result.current.isChecking).toBe(false);
            expect(result.current.error).toBeNull();
        });
    });

    describe('authentication check', () => {
        it('sets isChecking during check', async () => {
            mockWebviewClient.request.mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
            );

            const { result } = renderHook(() => useAuthStatus(defaultProps));

            act(() => {
                result.current.checkAuth();
            });

            expect(result.current.isChecking).toBe(true);

            await waitFor(() => {
                expect(result.current.isChecking).toBe(false);
            });
        });

        it('sets isAuthenticated on success', async () => {
            mockWebviewClient.request.mockResolvedValue({
                success: true,
                data: { authenticated: true, email: 'test@example.com' },
            });

            const { result } = renderHook(() => useAuthStatus(defaultProps));

            await act(async () => {
                await result.current.checkAuth();
            });

            expect(result.current.isAuthenticated).toBe(true);
            expect(result.current.userEmail).toBe('test@example.com');
        });

        it('sets error on failure', async () => {
            mockWebviewClient.request.mockResolvedValue({
                success: false,
                error: 'Auth check failed',
            });

            const { result } = renderHook(() => useAuthStatus(defaultProps));

            await act(async () => {
                await result.current.checkAuth();
            });

            expect(result.current.isAuthenticated).toBe(false);
            expect(result.current.error).toBe('Auth check failed');
        });
    });

    describe('login flow', () => {
        it('initiates login and waits for completion', async () => {
            mockWebviewClient.request
                .mockResolvedValueOnce({ success: true }) // requestAuth
                .mockResolvedValueOnce({  // auth complete message
                    success: true,
                    data: { authenticated: true },
                });

            const { result } = renderHook(() => useAuthStatus(defaultProps));

            await act(async () => {
                result.current.login();
            });

            expect(mockWebviewClient.request).toHaveBeenCalledWith('requestAuth', {});
        });

        it('handles login timeout', async () => {
            jest.useFakeTimers();

            mockWebviewClient.request.mockImplementation(
                () => new Promise(() => {}) // Never resolves
            );

            const { result } = renderHook(() => useAuthStatus(defaultProps));

            act(() => {
                result.current.login();
            });

            act(() => {
                jest.advanceTimersByTime(60000); // Login timeout
            });

            await waitFor(() => {
                expect(result.current.error).toContain('timeout');
            });

            jest.useRealTimers();
        });
    });

    describe('organization selection', () => {
        it('updates state when org selected', async () => {
            const { result } = renderHook(() => useAuthStatus(defaultProps));

            await act(async () => {
                result.current.selectOrganization({ id: 'org-1', name: 'Test Org' });
            });

            expect(defaultProps.updateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    selectedOrganization: { id: 'org-1', name: 'Test Org' },
                })
            );
        });
    });

    describe('can proceed logic', () => {
        it('sets canProceed true when authenticated and org selected', async () => {
            mockWebviewClient.request.mockResolvedValue({
                success: true,
                data: { authenticated: true },
            });

            const { result } = renderHook(() => useAuthStatus(defaultProps));

            await act(async () => {
                await result.current.checkAuth();
                result.current.selectOrganization({ id: 'org-1', name: 'Test' });
            });

            expect(defaultProps.setCanProceed).toHaveBeenLastCalledWith(true);
        });

        it('sets canProceed false when not authenticated', async () => {
            mockWebviewClient.request.mockResolvedValue({
                success: true,
                data: { authenticated: false },
            });

            const { result } = renderHook(() => useAuthStatus(defaultProps));

            await act(async () => {
                await result.current.checkAuth();
            });

            expect(defaultProps.setCanProceed).toHaveBeenLastCalledWith(false);
        });
    });
});
```

**Estimated Lines:** ~160

#### 2.2 useConfigNavigation Unit Tests

**File:** `tests/features/components/ui/hooks/useConfigNavigation.test.ts`

```typescript
import { renderHook, act } from '@testing-library/react';
import { useConfigNavigation } from '@/features/components/ui/hooks/useConfigNavigation';

describe('useConfigNavigation', () => {
    const mockSections = [
        { id: 'section-1', name: 'Section 1', fields: [{ key: 'field-1' }, { key: 'field-2' }] },
        { id: 'section-2', name: 'Section 2', fields: [{ key: 'field-3' }] },
    ];

    describe('initial state', () => {
        it('starts with no active section', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({ sections: mockSections })
            );

            expect(result.current.activeSectionIndex).toBe(0);
            expect(result.current.activeFieldIndex).toBe(0);
        });
    });

    describe('section navigation', () => {
        it('navigates to next section', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({ sections: mockSections })
            );

            act(() => {
                result.current.goToNextSection();
            });

            expect(result.current.activeSectionIndex).toBe(1);
        });

        it('navigates to previous section', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({
                    sections: mockSections,
                    initialSectionIndex: 1,
                })
            );

            act(() => {
                result.current.goToPreviousSection();
            });

            expect(result.current.activeSectionIndex).toBe(0);
        });

        it('does not go past last section', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({
                    sections: mockSections,
                    initialSectionIndex: 1,
                })
            );

            act(() => {
                result.current.goToNextSection();
            });

            expect(result.current.activeSectionIndex).toBe(1); // Stays at last
        });
    });

    describe('field navigation', () => {
        it('navigates to specific field', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({ sections: mockSections })
            );

            act(() => {
                result.current.goToField('field-3');
            });

            expect(result.current.activeSectionIndex).toBe(1);
            expect(result.current.activeFieldKey).toBe('field-3');
        });

        it('expands section when navigating to field', () => {
            const onSectionExpand = jest.fn();
            const { result } = renderHook(() =>
                useConfigNavigation({
                    sections: mockSections,
                    onSectionExpand,
                })
            );

            act(() => {
                result.current.goToField('field-3');
            });

            expect(onSectionExpand).toHaveBeenCalledWith('section-2');
        });
    });

    describe('completion tracking', () => {
        it('tracks completed sections', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({ sections: mockSections })
            );

            act(() => {
                result.current.markSectionComplete('section-1');
            });

            expect(result.current.completedSections).toContain('section-1');
        });

        it('calculates overall completion percentage', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({ sections: mockSections })
            );

            act(() => {
                result.current.markSectionComplete('section-1');
            });

            expect(result.current.completionPercentage).toBe(50);
        });
    });
});
```

**Estimated Lines:** ~130

---

### Phase 3: Component Gap Tests (Priority: MEDIUM)

#### 3.1 ComponentConfigStep.tsx Tests

**File:** `tests/features/components/ui/steps/ComponentConfigStep.test.tsx`

```typescript
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ComponentConfigStep } from '@/features/components/ui/steps/ComponentConfigStep';
import { mockWizardState, mockUpdateState, mockSetCanProceed } from './ComponentConfigStep.testUtils';

const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme}>
            {ui}
        </Provider>
    );
};

describe('ComponentConfigStep', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('rendering', () => {
        it('renders configuration sections for selected components', () => {
            renderWithProvider(
                <ComponentConfigStep
                    state={mockWizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            expect(screen.getByText(/configuration/i)).toBeInTheDocument();
        });

        it('shows loading state while loading component config', () => {
            renderWithProvider(
                <ComponentConfigStep
                    state={{ ...mockWizardState, componentConfigs: null }}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });
    });

    describe('field validation', () => {
        it('validates required fields', async () => {
            const user = userEvent.setup();

            renderWithProvider(
                <ComponentConfigStep
                    state={mockWizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Clear a required field
            const requiredField = screen.getByLabelText(/api key/i);
            await user.clear(requiredField);
            await user.tab(); // Blur to trigger validation

            await waitFor(() => {
                expect(screen.getByText(/required/i)).toBeInTheDocument();
            });
        });

        it('validates URL format', async () => {
            const user = userEvent.setup();

            renderWithProvider(
                <ComponentConfigStep
                    state={mockWizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            const urlField = screen.getByLabelText(/endpoint/i);
            await user.clear(urlField);
            await user.type(urlField, 'not-a-url');
            await user.tab();

            await waitFor(() => {
                expect(screen.getByText(/valid url/i)).toBeInTheDocument();
            });
        });

        it('disables proceed when validation errors exist', async () => {
            const user = userEvent.setup();

            renderWithProvider(
                <ComponentConfigStep
                    state={mockWizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Clear required field
            const requiredField = screen.getByLabelText(/api key/i);
            await user.clear(requiredField);
            await user.tab();

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenLastCalledWith(false);
            });
        });
    });

    describe('configuration persistence', () => {
        it('updates state when field value changes', async () => {
            const user = userEvent.setup();

            renderWithProvider(
                <ComponentConfigStep
                    state={mockWizardState}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            const field = screen.getByLabelText(/api key/i);
            await user.clear(field);
            await user.type(field, 'new-api-key');

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        componentConfigs: expect.any(Object),
                    })
                );
            });
        });
    });
});
```

**Estimated Lines:** ~150

---

### Phase 4: Error Scenario Tests (Priority: MEDIUM)

#### 4.1 Expand Auth Error Scenarios

**File:** `tests/features/authentication/ui/steps/AdobeAuthStep-errorScenarios.test.tsx`

```typescript
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import { mockProps, mockWebviewClient } from './AdobeAuthStep.testUtils';

describe('AdobeAuthStep - Error Scenarios', () => {
    describe('network errors', () => {
        it('shows network error message when check fails', async () => {
            mockWebviewClient.request.mockRejectedValue(new Error('Network error'));

            render(<AdobeAuthStep {...mockProps} />);

            await waitFor(() => {
                expect(screen.getByText(/network error/i)).toBeInTheDocument();
            });
        });

        it('provides retry option after network error', async () => {
            const user = userEvent.setup();
            mockWebviewClient.request
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({ success: true, data: { authenticated: true } });

            render(<AdobeAuthStep {...mockProps} />);

            await waitFor(() => {
                expect(screen.getByText(/retry/i)).toBeInTheDocument();
            });

            await user.click(screen.getByText(/retry/i));

            await waitFor(() => {
                expect(screen.getByText(/authenticated/i)).toBeInTheDocument();
            });
        });
    });

    describe('timeout errors', () => {
        it('shows timeout message when auth takes too long', async () => {
            jest.useFakeTimers();

            mockWebviewClient.request.mockImplementation(
                () => new Promise(() => {}) // Never resolves
            );

            render(<AdobeAuthStep {...mockProps} />);

            // Advance past timeout
            jest.advanceTimersByTime(60000);

            await waitFor(() => {
                expect(screen.getByText(/timed out/i)).toBeInTheDocument();
            });

            jest.useRealTimers();
        });
    });

    describe('auth failures', () => {
        it('shows specific error for invalid credentials', async () => {
            mockWebviewClient.request.mockResolvedValue({
                success: false,
                error: 'Invalid credentials',
            });

            render(<AdobeAuthStep {...mockProps} />);

            await waitFor(() => {
                expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
            });
        });

        it('shows specific error for expired session', async () => {
            mockWebviewClient.request.mockResolvedValue({
                success: false,
                error: 'Session expired',
            });

            render(<AdobeAuthStep {...mockProps} />);

            await waitFor(() => {
                expect(screen.getByText(/session expired/i)).toBeInTheDocument();
            });
        });
    });
});
```

**Estimated Lines:** ~100

---

## Test Utilities to Create

### Shared Test Setup

**File:** `tests/testUtils/renderWithProviders.tsx`

```typescript
import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ThemeProvider } from '@/core/ui/contexts/ThemeContext';

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
    theme?: 'light' | 'dark';
}

export function renderWithProviders(
    ui: ReactElement,
    { theme = 'light', ...options }: CustomRenderOptions = {}
) {
    const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <Provider theme={defaultTheme} colorScheme={theme}>
            <ThemeProvider initialTheme={theme}>
                {children}
            </ThemeProvider>
        </Provider>
    );

    return render(ui, { wrapper: Wrapper, ...options });
}
```

---

## Acceptance Criteria

### Phase 1: Critical Infrastructure
- [ ] ErrorBoundary.tsx has 15+ tests passing
- [ ] WebviewApp.tsx has 12+ tests passing
- [ ] Modal.tsx has 15+ tests passing
- [ ] All tests use renderWithProviders utility

### Phase 2: Hook Unit Tests
- [ ] useAuthStatus has 10+ tests passing
- [ ] useConfigNavigation has 10+ tests passing
- [ ] Tests cover error states and edge cases

### Phase 3: Component Gaps
- [ ] ComponentConfigStep.tsx has 10+ tests passing
- [ ] Tests cover validation scenarios

### Phase 4: Error Scenarios
- [ ] Auth error scenarios covered
- [ ] Network error handling verified
- [ ] Timeout handling verified

---

## Implementation Priority

| Priority | Tests | Effort | Impact |
|----------|-------|--------|--------|
| 1 | ErrorBoundary, WebviewApp | 5h | Critical infrastructure |
| 2 | Modal, useAuthStatus | 4h | High-use components |
| 3 | useConfigNavigation, ComponentConfigStep | 4h | Feature completeness |
| 4 | Error scenarios expansion | 3h | Robustness |
| 5 | Remaining gaps | 4h | Polish |

**Total Estimated Effort:** 20 hours

---

## File Changes Summary

### New Files
- `tests/core/ui/components/ErrorBoundary.test.tsx` (~150 lines)
- `tests/core/ui/components/WebviewApp.test.tsx` (~180 lines)
- `tests/core/ui/components/ui/Modal.test.tsx` (~200 lines)
- `tests/features/authentication/ui/hooks/useAuthStatus.test.ts` (~160 lines)
- `tests/features/components/ui/hooks/useConfigNavigation.test.ts` (~130 lines)
- `tests/features/components/ui/steps/ComponentConfigStep.test.tsx` (~150 lines)
- `tests/features/authentication/ui/steps/AdobeAuthStep-errorScenarios.test.tsx` (~100 lines)
- `tests/testUtils/renderWithProviders.tsx` (~30 lines)

### Total New Test Code
~1,100 lines of new test code

### Coverage Improvement
- Core UI Components: 38% → 65%
- Feature Hooks: 100% (maintained)
- Error Scenarios: 60% → 85%
