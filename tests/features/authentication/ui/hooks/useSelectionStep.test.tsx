import { renderHook, act, waitFor } from '@testing-library/react';
import { useSelectionStep } from '@/features/authentication/ui/hooks/useSelectionStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

// Mock dependencies
jest.mock('@/features/authentication/ui/hooks/useDebouncedLoading', () => ({
    useDebouncedLoading: jest.fn((value) => value), // Pass through for testing
}));

// Mock WebviewClient
const mockPostMessage = jest.fn();
const mockOnMessage = jest.fn().mockReturnValue(jest.fn());

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: any[]) => mockPostMessage(...args),
        onMessage: (...args: any[]) => mockOnMessage(...args),
    },
}));

interface TestItem {
    id: string;
    name: string;
    description?: string;
}

describe('useSelectionStep', () => {
    const mockUpdateState = jest.fn();
    const mockOnSelect = jest.fn();

    const baseState: Partial<WizardState> = {
        projectsCache: undefined,
        projectSearchFilter: '',
    };

    const testItems: TestItem[] = [
        { id: '1', name: 'Item 1', description: 'First item' },
        { id: '2', name: 'Item 2', description: 'Second item' },
        { id: '3', name: 'Item 3', description: 'Third item' },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessage.mockReturnValue(jest.fn()); // Return unsubscribe function
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
