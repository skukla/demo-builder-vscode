/**
 * useSelectionStep — the values it DERIVES: the seeded search query, the
 * debounced loading flag, and the filter's treatment of absent field values.
 *
 * `useDebouncedLoading` is mocked as a pass-through in the shared testUtils, so
 * `showLoading` here is exactly the expression the hook hands it — which is the
 * decision under test, not the debounce.
 */

import { useSelectionStep, UseSelectionStepOptions } from './useSelectionStep.testUtils';
import { baseState, resetMocks, TestItem, testItems } from './useSelectionStep.testUtils';

import { renderHook, act } from '@testing-library/react';
import { WizardState } from '@/types/webview';

/** Hoisted: an inline literal would be a new reference on every render. */
const NAME_FIELDS: ReadonlyArray<keyof TestItem> = ['name', 'description'];

describe('useSelectionStep - derived state', () => {
    const mockUpdateState = jest.fn();

    beforeEach(() => {
        resetMocks();
        mockUpdateState.mockClear();
    });

    function options(
        extra: Partial<UseSelectionStepOptions<TestItem>> = {},
    ): UseSelectionStepOptions<TestItem> {
        return {
            cacheKey: 'projectsCache',
            messageType: 'test-items',
            errorMessageType: 'test-error',
            state: baseState as WizardState,
            updateState: mockUpdateState,
            autoLoad: false,
            ...extra,
        };
    }

    describe('seeding the search query from wizard state', () => {
        it('restores a saved filter when a filter key is configured', () => {
            const state = {
                ...baseState,
                projectSearchFilter: 'saved query',
            } as WizardState;

            const { result } = renderHook(() =>
                useSelectionStep<TestItem>(
                    options({ state, searchFilterKey: 'projectSearchFilter' }),
                ),
            );

            expect(result.current.searchQuery).toBe('saved query');
        });

        it('starts empty when no filter key is configured', () => {
            const state = {
                ...baseState,
                projectSearchFilter: 'saved query',
            } as WizardState;

            const { result } = renderHook(() => useSelectionStep<TestItem>(options({ state })));

            expect(result.current.searchQuery).toBe('');
        });

        it('starts empty when the stored filter is not a string', () => {
            const state = {
                ...baseState,
                projectSearchFilter: undefined,
            } as WizardState;

            const { result } = renderHook(() =>
                useSelectionStep<TestItem>(
                    options({ state, searchFilterKey: 'projectSearchFilter' }),
                ),
            );

            expect(result.current.searchQuery).toBe('');
        });

        it('writes nothing to wizard state when no filter key is configured', () => {
            const { result } = renderHook(() => useSelectionStep<TestItem>(options()));

            act(() => {
                result.current.setSearchQuery('typed');
            });

            expect(mockUpdateState).not.toHaveBeenCalled();
        });
    });

    describe('showLoading', () => {
        it('is on during an initial load', () => {
            const { result } = renderHook(() => useSelectionStep<TestItem>(options()));

            expect(result.current.isLoading).toBe(true);
            expect(result.current.isRefreshing).toBe(false);
            expect(result.current.showLoading).toBe(true);
        });

        it('is off when the cache already holds items', () => {
            const state = { ...baseState, projectsCache: testItems } as WizardState;

            const { result } = renderHook(() => useSelectionStep<TestItem>(options({ state })));

            expect(result.current.showLoading).toBe(false);
        });

        it('stays off during a refresh, so the cached list keeps rendering', () => {
            const state = { ...baseState, projectsCache: testItems } as WizardState;

            const { result } = renderHook(() => useSelectionStep<TestItem>(options({ state })));

            act(() => {
                result.current.refresh();
            });

            expect(result.current.isLoading).toBe(true);
            expect(result.current.isRefreshing).toBe(true);
            expect(result.current.showLoading).toBe(false);
        });
    });

    describe('filtering', () => {
        it('returns every item when no search fields are configured', () => {
            const state = { ...baseState, projectsCache: testItems } as WizardState;

            const { result } = renderHook(() => useSelectionStep<TestItem>(options({ state })));

            act(() => {
                result.current.setSearchQuery('Item 1');
            });

            expect(result.current.filteredItems).toEqual(testItems);
        });

        it('skips items whose searched field is null or undefined', () => {
            const sparse = [
                { id: '1', name: 'Alpha' },
                { id: '2', name: 'Beta', description: null as unknown as string },
            ] as TestItem[];
            const state = { ...baseState, projectsCache: sparse } as WizardState;

            const { result } = renderHook(() =>
                useSelectionStep<TestItem>(options({ state, searchFields: NAME_FIELDS })),
            );

            // Neither the missing description nor the null one may be stringified into
            // something a query can match — "undefined" and "null" are not content.
            act(() => {
                result.current.setSearchQuery('undefined');
            });
            expect(result.current.filteredItems).toStrictEqual([]);

            act(() => {
                result.current.setSearchQuery('null');
            });
            expect(result.current.filteredItems).toStrictEqual([]);
        });

        it('matches on a present field while an absent one is skipped', () => {
            const sparse = [
                { id: '1', name: 'Alpha' },
                { id: '2', name: 'Beta', description: 'has text' },
            ] as TestItem[];
            const state = { ...baseState, projectsCache: sparse } as WizardState;

            const { result } = renderHook(() =>
                useSelectionStep<TestItem>(options({ state, searchFields: NAME_FIELDS })),
            );

            act(() => {
                result.current.setSearchQuery('has text');
            });

            expect(result.current.filteredItems).toStrictEqual([sparse[1]]);
        });
    });

    describe('selectItem', () => {
        it('is a no-op when no onSelect was supplied', () => {
            const state = { ...baseState, projectsCache: testItems } as WizardState;

            const { result } = renderHook(() => useSelectionStep<TestItem>(options({ state })));

            expect(() =>
                act(() => {
                    result.current.selectItem(testItems[0]);
                }),
            ).not.toThrow();
        });
    });
});
