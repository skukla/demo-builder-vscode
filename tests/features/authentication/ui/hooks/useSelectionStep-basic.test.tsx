/**
 * useSelectionStep Hook - Basic Selection Flow and Auto-Selection Tests
 *
 * Tests for basic selection flow and auto-selection edge cases.
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
import { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';
import { WizardState } from '@/types/webview';

describe('useSelectionStep - Basic Selection Flow', () => {
    const mockUpdateState = jest.fn();
    const mockOnSelect = jest.fn();

    beforeEach(() => {
        resetMocks();
        mockUpdateState.mockClear();
        mockOnSelect.mockClear();
    });

    describe('Happy Path - Basic Selection Flow', () => {
        it('should initialize with empty items when cache is empty', () => {
            const { result } = renderHook(() =>
                useSelectionStep<TestItem>({
                    cacheKey: 'projectsCache',
                    messageType: 'test-items',
                    errorMessageType: 'test-error',
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    autoLoad: false, // Prevent auto-load for this test
                })
            );

            expect(result.current.items).toEqual([]);
            expect(result.current.filteredItems).toEqual([]);
            // When cache is empty, hook initializes isLoading to true
            expect(result.current.isLoading).toBe(true);
            expect(result.current.error).toBeNull();
        });

        it('should load items from cache when available', () => {
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

            expect(result.current.items).toEqual(testItems);
            expect(result.current.filteredItems).toEqual(testItems);
            expect(result.current.hasLoadedOnce).toBe(true);
        });

        it('should trigger load when load() is called', () => {
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

            act(() => {
                result.current.load();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('test-items', {});
            expect(result.current.isLoading).toBe(true);
        });

        it('should update state when items are received', async () => {
            let messageCallback: ((data: unknown) => void) | null = null;
            mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
                if (type === 'test-items') {
                    messageCallback = callback;
                }
                return jest.fn(); // Unsubscribe
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

            // Simulate message from extension
            act(() => {
                messageCallback?.(testItems);
            });

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith({ projectsCache: testItems });
            });
        });

        it('should call onSelect when item is selected', () => {
            const { result } = renderHook(() =>
                useSelectionStep<TestItem>({
                    cacheKey: 'projectsCache',
                    messageType: 'test-items',
                    errorMessageType: 'test-error',
                    state: { ...baseState, projectsCache: testItems } as WizardState,
                    updateState: mockUpdateState,
                    onSelect: mockOnSelect,
                    autoLoad: false,
                })
            );

            act(() => {
                result.current.selectItem(testItems[0]);
            });

            expect(mockOnSelect).toHaveBeenCalledWith(testItems[0]);
        });
    });

    describe('Edge Cases - Auto-Selection', () => {
        it('should auto-select when only one item is available', async () => {
            const singleItem = [testItems[0]];
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
                    onSelect: mockOnSelect,
                    autoSelectSingle: true,
                    autoLoad: false,
                })
            );

            // Trigger load
            act(() => {
                result.current.load();
            });

            // Simulate single item response
            act(() => {
                messageCallback?.(singleItem);
            });

            await waitFor(() => {
                expect(mockOnSelect).toHaveBeenCalledWith(singleItem[0]);
            });
        });

        it('should auto-select using custom logic when provided', async () => {
            let messageCallback: ((data: unknown) => void) | null = null;
            mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
                if (type === 'test-items') {
                    messageCallback = callback;
                }
                return jest.fn();
            });

            const customSelect = jest.fn((items: TestItem[]) =>
                items.find(item => item.name === 'Item 2')
            );

            const { result } = renderHook(() =>
                useSelectionStep<TestItem>({
                    cacheKey: 'projectsCache',
                    messageType: 'test-items',
                    errorMessageType: 'test-error',
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    onSelect: mockOnSelect,
                    autoSelectCustom: customSelect,
                    autoLoad: false,
                })
            );

            // Trigger load
            act(() => {
                result.current.load();
            });

            // Simulate response
            act(() => {
                messageCallback?.(testItems);
            });

            await waitFor(() => {
                expect(mockOnSelect).toHaveBeenCalledWith(testItems[1]);
            });
        });

        it('should not auto-select if item already selected', async () => {
            const selectedItem = testItems[0];
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
                    selectedItem,
                    onSelect: mockOnSelect,
                    autoSelectSingle: true,
                    autoLoad: false,
                })
            );

            // Trigger load
            act(() => {
                result.current.load();
            });

            // Simulate single item response
            act(() => {
                messageCallback?.([testItems[0]]);
            });

            await waitFor(() => {
                expect(mockOnSelect).not.toHaveBeenCalled();
            });
        });
    });
});
