import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';

// Mock VS Code API for webviews
const mockVSCodeApi = {
    postMessage: jest.fn(),
    setState: jest.fn(),
    getState: jest.fn(() => null),
};

// Mock acquireVsCodeApi global function
(global as any).acquireVsCodeApi = jest.fn(() => mockVSCodeApi);

// Reset mocks before each test
beforeEach(() => {
    mockVSCodeApi.postMessage.mockClear();
    mockVSCodeApi.setState.mockClear();
    mockVSCodeApi.getState.mockClear();
});

// Clean up after each test
afterEach(() => {
    // Clean up any pending timers before React cleanup
    try {
        if (typeof setTimeout !== 'undefined' && jest.isMockFunction(setTimeout)) {
            jest.runOnlyPendingTimers();
            jest.clearAllTimers();
            jest.useRealTimers();
        }
    } catch {
        try {
            jest.useRealTimers();
        } catch {
            // Ignore - timers may already be real
        }
    }

    // Clean up React Testing Library
    cleanup();

    // Restore all mocks
    jest.restoreAllMocks();
});
