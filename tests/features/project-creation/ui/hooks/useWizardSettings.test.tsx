/**
 * `useWizardSettings`: the three VS Code settings the wizard keeps live — seeded
 * from the values the host sent at open, replaced by the extension's pushes,
 * and (for added demos) appended optimistically when the dialog adds one.
 *
 * Driven directly. Every WizardContainer suite still reaches the hook through
 * the wizard; this one pins the subscription itself — which pushes, that each
 * replaces its own list and no other, and that all three are dropped on unmount.
 */

import { act, renderHook } from '@testing-library/react';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';
import type { CustomBlockLibrary } from '@/types/blockLibraries';

const mockOnMessage = jest.fn();

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: {
        onMessage: (...args: unknown[]) => mockOnMessage(...args),
    },
}));

// Below the mock on purpose: `jest.mock` hoists above this file's imports only.
import { useWizardSettings } from '@/features/project-creation/ui/hooks/useWizardSettings';

const JEN = makeAddedDemo();
const BOB = makeAddedDemo({ name: 'Bob', source: { owner: 'bob', repo: 'shop' }, storefrontKind: 'headless' });

const LIBRARY: CustomBlockLibrary = {
    name: 'Partner blocks',
    source: { owner: 'partner', repo: 'blocks', branch: 'main' },
};

const OPEN_VALUES = {
    blockLibraryDefaults: ['hero', 'cards'],
    customBlockLibraryDefaults: [LIBRARY],
    addedDemos: [JEN],
};

/** The handler the hook registered for one push type. */
const handlerFor = (type: string): ((data: unknown) => void) =>
    mockOnMessage.mock.calls.find((call) => call[0] === type)?.[1] as (data: unknown) => void;

describe('useWizardSettings', () => {
    const unsubscribers: Record<string, jest.Mock> = {};

    beforeEach(() => {
        mockOnMessage.mockReset();
        mockOnMessage.mockImplementation((type: string) => {
            unsubscribers[type] = jest.fn();
            return unsubscribers[type];
        });
    });

    it('seeds the three lists from the values sent at open', () => {
        const { result } = renderHook(() => useWizardSettings(OPEN_VALUES));

        expect(result.current.blockLibraryDefaults).toEqual(['hero', 'cards']);
        expect(result.current.customBlockLibraryDefaults).toEqual([LIBRARY]);
        expect(result.current.addedDemos).toEqual([JEN]);
    });

    it('subscribes once to exactly the three settings pushes', () => {
        renderHook(() => useWizardSettings(OPEN_VALUES));

        expect(mockOnMessage.mock.calls.map((call) => call[0]).sort()).toEqual([
            'addedDemosUpdated',
            'blockLibraryDefaultsUpdated',
            'customBlockLibraryDefaultsUpdated',
        ]);
    });

    it('replaces the built-in defaults when the extension pushes them, and nothing else', () => {
        const { result } = renderHook(() => useWizardSettings(OPEN_VALUES));

        act(() => {
            handlerFor('blockLibraryDefaultsUpdated')({ blockLibraryDefaults: ['columns'] });
        });

        expect(result.current.blockLibraryDefaults).toEqual(['columns']);
        expect(result.current.customBlockLibraryDefaults).toEqual([LIBRARY]);
        expect(result.current.addedDemos).toEqual([JEN]);
    });

    it('replaces the custom libraries when the extension pushes them', () => {
        const { result } = renderHook(() => useWizardSettings(OPEN_VALUES));

        act(() => {
            handlerFor('customBlockLibraryDefaultsUpdated')({ customBlockLibraryDefaults: [] });
        });

        expect(result.current.customBlockLibraryDefaults).toStrictEqual([]);
        expect(result.current.blockLibraryDefaults).toEqual(['hero', 'cards']);
    });

    it('replaces the added demos when the extension pushes them', () => {
        const { result } = renderHook(() => useWizardSettings(OPEN_VALUES));

        act(() => {
            handlerFor('addedDemosUpdated')({ addedDemos: [BOB] });
        });

        expect(result.current.addedDemos).toEqual([BOB]);
    });

    it('drops all three subscriptions when the wizard closes', () => {
        const { unmount } = renderHook(() => useWizardSettings(OPEN_VALUES));

        unmount();

        expect(unsubscribers.blockLibraryDefaultsUpdated).toHaveBeenCalledTimes(1);
        expect(unsubscribers.customBlockLibraryDefaultsUpdated).toHaveBeenCalledTimes(1);
        expect(unsubscribers.addedDemosUpdated).toHaveBeenCalledTimes(1);
    });

    it('shows a demo the dialog added at once, and replaces a known repository in place', () => {
        const { result } = renderHook(() => useWizardSettings(OPEN_VALUES));

        act(() => {
            result.current.handleDemoAdded(BOB);
        });
        expect(result.current.addedDemos).toEqual([JEN, BOB]);

        const renamed = { ...JEN, name: 'Renamed' };
        act(() => {
            result.current.handleDemoAdded(renamed);
        });
        expect(result.current.addedDemos).toEqual([renamed, BOB]);
    });

    it('hands out the same handleDemoAdded across renders', () => {
        const { result, rerender } = renderHook(() => useWizardSettings(OPEN_VALUES));
        const first = result.current.handleDemoAdded;

        rerender();

        expect(result.current.handleDemoAdded).toBe(first);
    });
});
