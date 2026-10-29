/**
 * useBlockLibrarySelection — the block libraries ticked on Configure (EDS-39).
 *
 * The hook's one subtle promise: `changedSelection` stays undefined until the SC
 * touches the picker. Save sends it only then, so a Configure window that never
 * opened the picker cannot write an old selection over a newer one.
 */

import { act, renderHook } from '@testing-library/react';
import { useBlockLibrarySelection } from '@/features/dashboard/ui/configure/hooks/useBlockLibrarySelection';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import { createMockProject } from '../../../../../helpers/projectFake';

const MINE: CustomBlockLibrary = {
    name: 'My Blocks',
    source: { owner: 'acme', repo: 'my-blocks', branch: 'main' },
};
const THEIRS: CustomBlockLibrary = {
    name: 'Their Blocks',
    source: { owner: 'other', repo: 'their-blocks', branch: 'main' },
};

function render(selected?: string[], custom?: CustomBlockLibrary[]) {
    const project = createMockProject({
        selectedBlockLibraries: selected,
        customBlockLibraries: custom,
    });
    return renderHook(() => useBlockLibrarySelection({ project }));
}

describe('useBlockLibrarySelection', () => {
    it('starts from what the project has recorded, with nothing to send', () => {
        const { result } = render(['demo-team-blocks'], [MINE]);

        expect(result.current.selectedBlockLibraries).toEqual(['demo-team-blocks']);
        expect(result.current.customBlockLibraries).toEqual([MINE]);
        expect(result.current.changedSelection).toBeUndefined();
    });

    it('starts empty for a project that has recorded none', () => {
        const { result } = render();

        expect(result.current.selectedBlockLibraries).toStrictEqual([]);
        expect(result.current.customBlockLibraries).toStrictEqual([]);
    });

    it('adds a ticked library and has the whole selection to send', () => {
        const { result } = render(['demo-team-blocks'], [MINE]);

        act(() => result.current.toggleBlockLibrary('demo-builder-blocks', true));

        expect(result.current.selectedBlockLibraries).toEqual([
            'demo-team-blocks',
            'demo-builder-blocks',
        ]);
        expect(result.current.changedSelection).toEqual({
            selectedBlockLibraries: ['demo-team-blocks', 'demo-builder-blocks'],
            customBlockLibraries: [MINE],
        });
    });

    it('removes an unticked library', () => {
        const { result } = render(['demo-team-blocks', 'demo-builder-blocks']);

        act(() => result.current.toggleBlockLibrary('demo-team-blocks', false));

        expect(result.current.selectedBlockLibraries).toEqual(['demo-builder-blocks']);
    });

    it('does not record a library twice', () => {
        const { result } = render(['demo-team-blocks']);

        act(() => result.current.toggleBlockLibrary('demo-team-blocks', true));

        expect(result.current.selectedBlockLibraries).toEqual(['demo-team-blocks']);
    });

    it('adds and removes a custom library by its repository', () => {
        const { result } = render([], [THEIRS]);

        act(() => result.current.toggleCustomLibrary(MINE, true));
        expect(result.current.customBlockLibraries).toEqual([THEIRS, MINE]);

        // A different object naming the same repository is the same library.
        act(() => result.current.toggleCustomLibrary({ ...THEIRS, name: 'Renamed' }, false));
        expect(result.current.customBlockLibraries).toEqual([MINE]);
    });

    it('hands back the same selection object until the selection changes', () => {
        const { result, rerender } = render();
        act(() => result.current.toggleBlockLibrary('demo-builder-blocks', true));
        const first = result.current.changedSelection;

        rerender();

        expect(result.current.changedSelection).toBe(first);
    });
});
