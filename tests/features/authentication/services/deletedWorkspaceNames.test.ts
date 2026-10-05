/**
 * DeletedWorkspaceNames — which names a new workspace must not take yet, and that
 * they survive a window reload through the saved state.
 */

import { DeletedWorkspaceNames, NAME_REST_MS } from '@/features/authentication/services/deletedWorkspaceNames';
import type { SavedState } from '@/features/authentication/services/orgServicesSavedCatalog';

function savedState(): SavedState & { values: Map<string, unknown> } {
    const values = new Map<string, unknown>();
    return {
        values,
        get: <T>(key: string) => values.get(key) as T | undefined,
        update: (key: string, value: unknown) => {
            values.set(key, value);
            return Promise.resolve();
        },
    };
}

describe('DeletedWorkspaceNames', () => {
    it('keeps names across a reload, through the saved state', async () => {
        const state = savedState();
        await new DeletedWorkspaceNames(state, () => 0).remember('proj-1', 'JustriteERP');

        expect(new DeletedWorkspaceNames(state, () => 60_000).resting('proj-1')).toEqual(['JustriteERP']);
    });

    it('lets a name go once it has rested', async () => {
        let now = 0;
        const names = new DeletedWorkspaceNames(savedState(), () => now);
        await names.remember('proj-1', 'JustriteERP');

        now = NAME_REST_MS;

        expect(names.resting('proj-1')).toStrictEqual([]);
    });

    it('drops rested names when it next saves', async () => {
        let now = 0;
        const state = savedState();
        const names = new DeletedWorkspaceNames(state, () => now);
        await names.remember('proj-1', 'OldERP');
        now = NAME_REST_MS + 1;

        await names.remember('proj-1', 'NewERP');

        expect(state.values.get('demoBuilder.deletedWorkspaceNames.proj-1')).toEqual([
            { name: 'NewERP', deletedAt: NAME_REST_MS + 1 },
        ]);
    });

    it('holds a name deleted twice once, restarting its rest', async () => {
        let now = 0;
        const names = new DeletedWorkspaceNames(savedState(), () => now);
        await names.remember('proj-1', 'JustriteERP');
        now = NAME_REST_MS - 1;
        await names.remember('proj-1', 'justriteerp');
        now = NAME_REST_MS + 1;

        expect(names.resting('proj-1')).toEqual(['justriteerp']);
    });

    it('reads nothing from a saved value of the wrong shape', () => {
        const state = savedState();
        state.values.set('demoBuilder.deletedWorkspaceNames.proj-1', 'not a list');

        expect(new DeletedWorkspaceNames(state).resting('proj-1')).toStrictEqual([]);
    });

    it('does not throw when the save fails', async () => {
        const state = { get: () => undefined, update: () => Promise.reject(new Error('disk')) };

        await expect(new DeletedWorkspaceNames(state).remember('proj-1', 'JustriteERP')).resolves.toBeUndefined();
    });
});
