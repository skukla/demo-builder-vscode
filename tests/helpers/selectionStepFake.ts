/**
 * The canonical fake for what `useSelectionStep` returns.
 *
 * WHY THIS IS TYPED, and why that is the whole point of the file.
 *
 * Two suites hand-rolled this object under two different names
 * (`createMockSelectionStep`, `createMockUseSelectionStepReturn`), both untyped —
 * one took a bespoke `MockSelectionStepConfig` interface listing the fields by
 * hand, the other took a bare `overrides = {}`. Neither was checked against
 * anything, and on 2026-08-31 BOTH were found missing `errorCode`, a field the
 * real hook has returned since typed error handling landed. A suite driving a
 * component through this fake was therefore rendering against a hook result that
 * does not exist, and nothing could say so: an untyped object literal satisfies
 * an untyped mock forever.
 *
 * `UseSelectionStepResult<T>` is exported from the hook, `tsconfig.test.json`
 * includes `tests/**`, and `npm run typecheck:tests` runs in CI — so pinning the
 * return type here means the next field added to the hook fails to compile until
 * this fake carries it. That is the check the two hand-rolls opted out of.
 *
 * The two suites keep their own wrappers and their own defaults: the project
 * picker starts empty, the workspace picker starts loaded. Those differ because
 * the suites test different things, not because anyone disagreed about the shape.
 *
 * @see src/core/ui/hooks/useSelectionStep.ts — the interface this must satisfy
 */

import type { UseSelectionStepResult } from '@/core/ui/hooks';

/**
 * Build a `useSelectionStep` return value with neutral defaults.
 *
 * Defaults are the empty/idle state — no items, nothing loading, no error. A
 * caller that wants a loaded list passes `items`/`filteredItems` explicitly
 * rather than relying on a default, so a fake never claims a state its suite did
 * not ask for.
 *
 * @param overrides - Fields to replace. Typed, so an unknown or misspelled field
 *   fails `typecheck:tests` instead of being silently ignored at runtime.
 * @returns A complete `UseSelectionStepResult<T>`.
 */
export function createSelectionStepFake<T extends { id: string }>(
    overrides: Partial<UseSelectionStepResult<T>> = {}
): UseSelectionStepResult<T> {
    return {
        items: [],
        filteredItems: [],
        isLoading: false,
        showLoading: false,
        isRefreshing: false,
        hasLoadedOnce: false,
        error: null,
        errorCode: null,
        searchQuery: '',
        setSearchQuery: jest.fn(),
        load: jest.fn(),
        refresh: jest.fn(),
        selectItem: jest.fn(),
        ...overrides,
    };
}
