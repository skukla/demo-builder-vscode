/**
 * useSelectionStep Hook - Search, Filter, and Error Handling Tests
 *
 * Tests for search/filter functionality and error handling.
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

describe('useSelectionStep - Search, Filter, and Error Handling', () => {
    const mockUpdateState = jest.fn();

    beforeEach(() => {
        resetMocks();
        mockUpdateState.mockClear();
    });

    describe('Search and Filter', () => {
        it('should filter items by search query', () => {
            const stateWithItems = {
                ...baseState,
                projectsCache: testItems,
            };

            const { result } = renderHook(() =>
                useSelectionStep<TestItem>({
                    cacheKey: 'projectsCache',
                    messageType: 'test-items',
                    errorMessageType: 'test-error',
                    state: stateWithItems as WizardState,
                    updateState: mockUpdateState,
                    searchFields: ['name', 'description'],
                    autoLoad: false,
                })
            );

            act(() => {
                result.current.setSearchQuery('Item 1');
            });

            expect(result.current.filteredItems).toHaveLength(1);
            expect(result.current.filteredItems[0].id).toBe('1');
        });

        it('should filter items by description', () => {
            const stateWithItems = {
                ...baseState,
                projectsCache: testItems,
            };

            const { result } = renderHook(() =>
                useSelectionStep<TestItem>({
                    cacheKey: 'projectsCache',
                    messageType: 'test-items',
                    errorMessageType: 'test-error',
                    state: stateWithItems as WizardState,
                    updateState: mockUpdateState,
                    searchFields: ['name', 'description'],
                    autoLoad: false,
                })
            );

            act(() => {
                result.current.setSearchQuery('Second');
            });

            expect(result.current.filteredItems).toHaveLength(1);
            expect(result.current.filteredItems[0].id).toBe('2');
        });

        it('should persist search query to wizard state', async () => {
            const { result } = renderHook(() =>
                useSelectionStep<TestItem>({
                    cacheKey: 'projectsCache',
                    messageType: 'test-items',
                    errorMessageType: 'test-error',
                    state: { ...baseState, projectsCache: testItems } as WizardState,
                    updateState: mockUpdateState,
                    searchFilterKey: 'projectSearchFilter',
                    searchFields: ['name'],
                    autoLoad: false,
                })
            );

            act(() => {
                result.current.setSearchQuery('test query');
            });

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith({ projectSearchFilter: 'test query' });
            });
        });

        it('should return all items when search query is empty', () => {
            const stateWithItems = {
                ...baseState,
                projectsCache: testItems,
            };

            const { result } = renderHook(() =>
                useSelectionStep<TestItem>({
                    cacheKey: 'projectsCache',
                    messageType: 'test-items',
                    errorMessageType: 'test-error',
                    state: stateWithItems as WizardState,
                    updateState: mockUpdateState,
                    searchFields: ['name'],
                    autoLoad: false,
                })
            );

            expect(result.current.filteredItems).toEqual(testItems);
        });
    });

    describe('Error Handling', () => {
        it('should handle error messages from extension', async () => {
            let errorCallback: ((data: unknown) => void) | null = null;
            mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
                if (type === 'test-error') {
                    errorCallback = callback;
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

            // Trigger load
            act(() => {
                result.current.load();
            });

            // Simulate error
            act(() => {
                errorCallback?.({ error: 'Failed to load items' });
            });

            await waitFor(() => {
                expect(result.current.error).toBe('Failed to load items');
                expect(result.current.isLoading).toBe(false);
            });
        });

        it('should handle structured error in item response', async () => {
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

            // Trigger load
            act(() => {
                result.current.load();
            });

            // Simulate error in items response
            act(() => {
                messageCallback?.({ error: 'Timeout error' });
            });

            await waitFor(() => {
                expect(result.current.error).toBe('Timeout error');
                expect(result.current.isLoading).toBe(false);
            });
        });

        it('should handle validation errors before load', () => {
            const validateBeforeLoad = jest.fn(() => ({
                valid: false,
                error: 'No organization selected',
            }));

            const { result } = renderHook(() =>
                useSelectionStep<TestItem>({
                    cacheKey: 'projectsCache',
                    messageType: 'test-items',
                    errorMessageType: 'test-error',
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    validateBeforeLoad,
                    autoLoad: false,
                })
            );

            act(() => {
                result.current.load();
            });

            expect(result.current.error).toBe('No organization selected');
            expect(mockPostMessage).not.toHaveBeenCalled();
        });
    });
});
