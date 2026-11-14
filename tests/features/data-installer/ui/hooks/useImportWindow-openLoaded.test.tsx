/**
 * Install from File's install window (step-07 F2, P4-Q7): `openLoaded` opens the job window on the
 * datapack a clean load just added to My Datapacks, with no flyout open, fixed at the moment it opens
 * with the project's holding, so installing over a held datapack is a switch (`windowRoute`).
 */

import '../../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
import { type Owned, useImportWindow, windowRoute } from '@/features/data-installer/ui/hooks/useImportWindow';
import type { ProjectDatapack } from '@/types/datapack';

const LOADED = { id: { name: 'my-luma-2-x1y2z3', version: '20261110-091500' }, displayName: 'My Luma 2' };
const HELD: ProjectDatapack = { name: 'bodea', version: 'main', store: 'library' };

function opened(owned: Owned) {
    const { result } = renderHook(() => useImportWindow(null, 'installer', owned));
    act(() => result.current.openLoaded(LOADED));
    return result.current.window;
}

// No types: the window reads the datapack's own list (a Replace may have stored only some, review of F2).
// The loaded datapack's name joins the SC's own names, which the catalog read before the load: the
// switch's save question must not offer the name the load just took (review of F2).
it('opens on the loaded datapack in My Datapacks, with no flyout, carrying what the project holds', () => {
    const owned: Owned = { holding: { pack: HELD, recorded: true }, ownNames: ['My Luma'] };

    expect(opened(owned)).toStrictEqual({ ...LOADED, store: 'library', holding: owned.holding, ownNames: ['My Luma', 'My Luma 2'] });
});

it('lists a name it already has once', () => {
    expect(opened({ ownNames: ['my luma 2'] })?.ownNames).toStrictEqual(['my luma 2']);
});

it('is a switch over a held datapack Demo Builder installed, and an install over none', () => {
    const switching = opened({ holding: { pack: HELD, recorded: true }, ownNames: [] });
    const first = opened({ ownNames: [] });

    expect(switching && windowRoute(switching)).toBe('switch');
    expect(first && windowRoute(first)).toBe('install');
});

// Review of F2: Install from File with Replace on the version the project holds is the one screen
// door to that route besides a missing record. It installs in place, removing nothing first, so the
// install record stays the held version's; the handler's side is `importHandlers-replace.test.ts`
// ("the same version again settles nothing and removes nothing first").
it('installs in place after a Replace of the version the project holds, never a switch', () => {
    const sameVersion = { ...LOADED, id: { name: HELD.name, version: HELD.version } };
    const { result } = renderHook(() => useImportWindow(null, 'installer', { holding: { pack: HELD, recorded: true }, ownNames: [] }));
    act(() => result.current.openLoaded(sameVersion));
    const window = result.current.window;

    expect(window && windowRoute(window)).toBe('install');
    expect(window?.holding).toStrictEqual({ pack: HELD, recorded: true });
});
