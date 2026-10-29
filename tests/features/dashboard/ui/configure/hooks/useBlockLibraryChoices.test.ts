/**
 * useBlockLibraryChoices — Configure's block-library choices follow the setting.
 *
 * The promise: a custom library added in VS Code settings while Configure is
 * open appears on the Block Libraries tab without reopening the screen.
 */

import { webviewClientHandlers } from '../../../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
// Below the wall on purpose: the mock above must register before the hook binds
// `webviewClient`.
import { useBlockLibraryChoices } from '@/features/dashboard/ui/configure/hooks/useBlockLibraryChoices';
import type { BlockLibrary, CustomBlockLibrary } from '@/types/blockLibraries';
import type {
    ConfigureBlockLibraryChoices,
    CustomBlockLibraryDefaultsUpdatedPayload,
} from '@/types/webviewPayloads';

const CATALOG: BlockLibrary = {
    id: 'demo-team-blocks',
    name: 'Demo Team Blocks',
    description: 'Blocks from the demo team.',
    type: 'standalone',
    source: { owner: 'demo-team', repo: 'blocks', branch: 'main' },
    stackTypes: ['eds'],
};
const MINE: CustomBlockLibrary = {
    name: 'My Blocks',
    source: { owner: 'acme', repo: 'my-blocks', branch: 'main' },
};
const ADDED: CustomBlockLibrary = {
    name: 'New Blocks',
    source: { owner: 'acme', repo: 'new-blocks', branch: 'main' },
};
const CHOICES: ConfigureBlockLibraryChoices = {
    native: [],
    available: [CATALOG],
    customDefaults: [MINE],
};

function pushSettingChange(customBlockLibraryDefaults: CustomBlockLibrary[]): void {
    const payload: CustomBlockLibraryDefaultsUpdatedPayload = { customBlockLibraryDefaults };
    act(() => webviewClientHandlers.get('customBlockLibraryDefaultsUpdated')?.(payload));
}

describe('useBlockLibraryChoices', () => {
    it('starts from the choices sent at open', () => {
        const { result } = renderHook(() => useBlockLibraryChoices(CHOICES));

        expect(result.current).toBe(CHOICES);
    });

    it('swaps in the new custom list when the setting changes, keeping the catalog lists', () => {
        const { result } = renderHook(() => useBlockLibraryChoices(CHOICES));

        pushSettingChange([MINE, ADDED]);

        expect(result.current).toEqual({
            native: [],
            available: [CATALOG],
            customDefaults: [MINE, ADDED],
        });
    });

    it('drops a custom library that was removed from settings', () => {
        const { result } = renderHook(() => useBlockLibraryChoices(CHOICES));

        pushSettingChange([]);

        expect(result.current?.customDefaults).toStrictEqual([]);
    });

    it('stays undefined when the extension sent no choices', () => {
        const { result } = renderHook(() => useBlockLibraryChoices(undefined));

        pushSettingChange([ADDED]);

        expect(result.current).toBeUndefined();
    });

    it('stops listening once the screen unmounts', () => {
        const { unmount } = renderHook(() => useBlockLibraryChoices(CHOICES));

        unmount();

        expect(webviewClientHandlers.has('customBlockLibraryDefaultsUpdated')).toBe(false);
    });
});
