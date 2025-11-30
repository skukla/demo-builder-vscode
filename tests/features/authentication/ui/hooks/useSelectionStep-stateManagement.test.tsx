/**
 * useSelectionStep Hook - Refresh Behavior and Loading States Tests
 *
 * Tests for refresh functionality and loading state management.
 */

// Mock dependencies - must be in test file for proper hoisting
jest.mock('@/core/ui/hooks/useDebouncedLoading', () => ({
    useDebouncedLoading: jest.fn((value) => value), // Pass through for testing
}));

// Import mock exports from testUtils
import {
    mockPostMessage,
    mockOnMessage,
    TestItem,
    baseState,
    testItems,
    resetMocks,
} from './useSelectionStep.testUtils';

// Mock WebviewClient - must be in test file for proper hoisting
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: any[]) => {
            const { mockPostMessage } = require('./useSelectionStep.testUtils');
            return mockPostMessage(...args);
        },
        onMessage: (...args: any[]) => {
            const { mockOnMessage } = require('./useSelectionStep.testUtils');
            return mockOnMessage(...args);
        },
    },
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useSelectionStep } from '@/features/authentication/ui/hooks/useSelectionStep';
import { WizardState } from '@/types/webview';

describe('useSelectionStep - Refresh and Loading States', () => {
    const mockUpdateState = jest.fn();

    beforeEach(() => {
        resetMocks();
        mockUpdateState.mockClear();
    });

    describe('Refresh Behavior', () => {
        it('should set isRefreshing state when refresh is called', () => {
            const stateWithCache = {
                ...baseState,
                projectsCache: testItems,
            };

            const { result } = renderHook(() =>
                useSelectionStep<TestItem>({
                    cacheKey: 'projectsCache',
                    messageType: 'test-items',
                    errorMessageType: 'test-error',
                    state: stateWithCache as WizardState,
                    updateState: mockUpdateState,
                    autoLoad: false,
                })
            );

            act(() => {
                result.current.refresh();
            });

            expect(result.current.isRefreshing).toBe(true);
            expect(mockPostMessage).toHaveBeenCalledWith('test-items', {});
        });

        it('should clear isRefreshing after refresh completes', async () => {
            let messageCallback: ((data: unknown) => void) | null = null;
            mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
                if (type === 'test-items') {
                    messageCallback = callback;
                }
                return jest.fn();
            });

            const stateWithCache = {
                ...baseState,
                projectsCache: testItems,
            };

            const { result } = renderHook(() =>
                useSelectionStep<TestItem>({
                    cacheKey: 'projectsCache',
                    messageType: 'test-items',
                    errorMessageType: 'test-error',
                    state: stateWithCache as WizardState,
                    updateState: mockUpdateState,
                    autoLoad: false,
                })
            );

            act(() => {
                result.current.refresh();
            });

            expect(result.current.isRefreshing).toBe(true);

            // Complete refresh
            act(() => {
                messageCallback?.(testItems);
            });

            await waitFor(() => {
                expect(result.current.isRefreshing).toBe(false);
            });
        });
    });

    describe('Loading States', () => {
        it('should track hasLoadedOnce correctly', async () => {
            let messageCallback: ((data: unknown) => void) | null = null;
            mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
                if (type === 'test-items') {
                    messageCallback = callback;
                }
                return jest.fn();
            });

            const { result } = renderHook(() =>
                useSelectionStep<TestItem>({
                    cacheKey: 'projectsCache',
                    messageType: 'test-items',
                    errorMessageType: 'test-error',
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    autoLoad: false,
                })
            );

            expect(result.current.hasLoadedOnce).toBe(false);

            // Trigger load
            act(() => {
                result.current.load();
            });

            // Complete load
            act(() => {
                messageCallback?.(testItems);
            });

            await waitFor(() => {
                expect(result.current.hasLoadedOnce).toBe(true);
            });
        });

        it('should differentiate between initial load and refresh', () => {
            const stateWithCache = {
                ...baseState,
                projectsCache: testItems,
            };

            const { result } = renderHook(() =>
                useSelectionStep<TestItem>({
                    cacheKey: 'projectsCache',
                    messageType: 'test-items',
                    errorMessageType: 'test-error',
                    state: stateWithCache as WizardState,
                    updateState: mockUpdateState,
                    autoLoad: false,
                })
            );

            // With cache, should not be loading initially
            expect(result.current.isLoading).toBe(false);
            expect(result.current.hasLoadedOnce).toBe(true);

            // Refresh should set different state
            act(() => {
                result.current.refresh();
            });

            expect(result.current.isRefreshing).toBe(true);
        });
    });
});
