/**
 * useDetailFlyout (walk F77, 2026-11-08): Luma's flyout opened on "main" while its card showed
 * eds-compatible, with no version chosen. A card shows its default until the screen has read which
 * version the demo uses; once that arrives, the demo's own pack moves to it unless the SC picked
 * another version. Each read says why, for Debug Logs.
 */

import { act, renderHook } from '@testing-library/react';
import { groupDatapacks } from '@/features/data-installer/services/datapackCatalog';
import type { DatapackSummary } from '@/features/data-installer/types';
import {
    OPEN_WHY,
    useDetailFlyout,
    type DetailRead,
} from '@/features/data-installer/ui/hooks/useDetailFlyout';
import type { ProjectDatapack } from '@/types/datapack';

function pack(name: string, version: string): DatapackSummary {
    return {
        id: { name, version },
        displayName: name,
        shared: false,
        dataTypes: [],
        art: {},
        store: 'library',
        mine: true,
    };
}

const GROUPS = groupDatapacks([
    pack('luma', 'main'),
    pack('luma', 'eds-compatible'),
    pack('bodea', 'main'),
]);
const HELD: ProjectDatapack = { name: 'luma', version: 'eds-compatible', store: 'library' };
const NO_PICKS: Record<string, string> = {};
const MAIN = { name: 'luma', version: 'main' };

function setUp(initial: { held?: ProjectDatapack; versions?: Record<string, string> } = {}) {
    const load = jest.fn<void, [DetailRead]>();
    let held = initial.held;
    const versions = initial.versions ?? NO_PICKS;
    const hook = renderHook(() => useDetailFlyout({ load, held, versions, groups: GROUPS }));
    const heldArrives = (value: ProjectDatapack): void => {
        held = value;
        hook.rerender();
    };
    return { load, result: hook.result, heldArrives };
}

describe('useDetailFlyout', () => {
    it('opens on the version its card showed, and says so', () => {
        const { load, result } = setUp({ held: HELD });

        act(() => result.current.open({ name: 'bodea', version: 'main' }, 'library'));

        expect(result.current.selected).toEqual({ name: 'bodea', version: 'main' });
        expect(load).toHaveBeenCalledWith({
            datapackName: 'bodea',
            version: 'main',
            store: 'library',
            why: OPEN_WHY.card,
        });
    });

    it("moves the demo's own pack to the demo's version when that arrives after the click", () => {
        const { load, result, heldArrives } = setUp();
        act(() => result.current.open(MAIN, 'library'));

        heldArrives(HELD);

        expect(result.current.selected).toEqual({ name: 'luma', version: 'eds-compatible' });
        expect(load).toHaveBeenLastCalledWith({
            datapackName: 'luma',
            version: 'eds-compatible',
            store: 'library',
            why: OPEN_WHY.demo,
        });
    });

    it('leaves a version the SC picked on the card', () => {
        const { load, result, heldArrives } = setUp({ versions: { 'library:luma': 'main' } });
        act(() => result.current.open(MAIN, 'library'));

        heldArrives(HELD);

        expect(result.current.selected).toEqual(MAIN);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("stays put when the pack no longer lists the demo's version", () => {
        const { load, result, heldArrives } = setUp();
        act(() => result.current.open(MAIN, 'library'));

        heldArrives({ ...HELD, version: 'deleted-version' });

        expect(result.current.selected).toEqual(MAIN);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("leaves another pack's flyout alone", () => {
        const { load, result, heldArrives } = setUp();
        act(() => result.current.open({ name: 'bodea', version: 'main' }, 'library'));

        heldArrives(HELD);

        expect(load).toHaveBeenCalledTimes(1);
    });

    it('closes', () => {
        const { result } = setUp({ held: HELD });
        act(() => result.current.open(MAIN, 'library'));

        act(() => result.current.close());

        expect(result.current.selected).toBeUndefined();
    });
});
