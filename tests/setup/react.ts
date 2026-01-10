import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';

// =============================================================================
// Global RAF Mock (CRITICAL for useFocusOnMount hook)
// =============================================================================
// useFocusOnMount uses a 3-tier focus strategy: immediate → RAF → setTimeout
// Without this mock, RAF callbacks never execute, causing tests to hang
const mockRAF = jest.fn((callback: FrameRequestCallback) => {
    // Execute callback synchronously to avoid pending frames
    callback(0);
    return 1;
});
const mockCancelRAF = jest.fn();

global.requestAnimationFrame = mockRAF;
global.cancelAnimationFrame = mockCancelRAF;

// =============================================================================
// VS Code API Mock
// =============================================================================
const mockVSCodeApi = {
    postMessage: jest.fn(),
    setState: jest.fn(),
    getState: jest.fn(() => null),
};

// Mock acquireVsCodeApi global function
(global as any).acquireVsCodeApi = jest.fn(() => mockVSCodeApi);

// =============================================================================
// Test Lifecycle Hooks
// =============================================================================

// Enable fake timers and reset mocks before each test
beforeEach(() => {
    // CRITICAL: Enable fake timers for all React tests
    // This prevents hangs from debounce hooks (useDebouncedValue, useDebouncedLoading)
    // and polling hooks (usePollingWithTimeout)
    jest.useFakeTimers();

    // Clear RAF mocks
    mockRAF.mockClear();
    mockCancelRAF.mockClear();

    // Clear VS Code API mocks
    mockVSCodeApi.postMessage.mockClear();
    mockVSCodeApi.setState.mockClear();
    mockVSCodeApi.getState.mockClear();
});

// Clean up after each test
afterEach(() => {
    // Run any pending timers to prevent state update warnings
    try {
        jest.runOnlyPendingTimers();
    } catch {
        // Ignore if timers already cleared
    }

    // Clear all timers
    try {
        jest.clearAllTimers();
    } catch {
        // Ignore
    }

    // Always restore real timers for clean state
    try {
        jest.useRealTimers();
    } catch {
        // Ignore - timers may already be real
    }

    // Clean up React Testing Library
    cleanup();

    // Restore all mocks
    jest.restoreAllMocks();
});
