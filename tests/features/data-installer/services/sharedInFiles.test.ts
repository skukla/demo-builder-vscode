/**
 * "Shared in a file" (datapack-engine step 07): exporting a project whose pack is in the
 * datapack library records when, so deleting that pack later warns that anyone who has not
 * created the project yet will get the pack it was made from instead.
 */

import {
    SHARED_IN_FILES_KEY,
    type SharedInFilesMemento,
    recordSharedInFile,
    sharedInFile,
    sharedInFileWarning,
} from '@/features/data-installer/services/sharedInFiles';

function memento(initial?: unknown): SharedInFilesMemento & { store: Map<string, unknown> } {
    const store = new Map<string, unknown>(initial === undefined ? [] : [[SHARED_IN_FILES_KEY, initial]]);
    return {
        store,
        get: <T>(key: string) => store.get(key) as T | undefined,
        update: async (key: string, value: unknown) => {
            store.set(key, value);
        },
    };
}

const AT = new Date('2026-10-27T15:00:00Z');
const LIBRARY_PACK = { name: 'acme-demo-1a2b3c', version: '20261029-183005', store: 'library' as const, origin: { name: 'bodea', version: 'main' } };

describe('recordSharedInFile', () => {
    it('records a library pack by name and version, with when and the pack it was made from', async () => {
        const m = memento();

        await recordSharedInFile(m, { datapack: LIBRARY_PACK }, AT);

        expect(m.store.get(SHARED_IN_FILES_KEY)).toEqual({
            'acme-demo-1a2b3c@20261029-183005': { at: '2026-10-27T15:00:00.000Z', originName: 'bodea' },
        });
    });

    it('keeps what it recorded for other packs', async () => {
        const m = memento({ 'other@1': { at: '2026-10-01T00:00:00.000Z' } });

        await recordSharedInFile(m, { datapack: LIBRARY_PACK }, AT);

        expect(Object.keys(m.store.get(SHARED_IN_FILES_KEY) as object).sort()).toEqual(['acme-demo-1a2b3c@20261029-183005', 'other@1']);
    });

    it('records nothing for a Data Installer pack, or a project with none', async () => {
        const m = memento();

        await recordSharedInFile(m, { datapack: { name: 'bodea', version: 'main' } }, AT);
        await recordSharedInFile(m, { datapack: { name: 'bodea', version: 'main', store: 'installer' } }, AT);
        await recordSharedInFile(m, {}, AT);

        expect(m.store.has(SHARED_IN_FILES_KEY)).toBe(false);
    });
});

describe('sharedInFile', () => {
    it('answers the entry for that version', () => {
        const m = memento({ 'acme@1': { at: '2026-10-27T15:00:00.000Z', originName: 'bodea' } });

        expect(sharedInFile(m, { name: 'acme', version: '1' })).toEqual({ at: '2026-10-27T15:00:00.000Z', originName: 'bodea' });
        expect(sharedInFile(m, { name: 'acme', version: '2' })).toBeUndefined();
    });

    it('reads anything that is not a record of entries as nothing recorded', () => {
        expect(sharedInFile(memento(true), { name: 'acme', version: '1' })).toBeUndefined();
        expect(sharedInFile(memento({ 'acme@1': 'yes' }), { name: 'acme', version: '1' })).toBeUndefined();
    });
});

describe('sharedInFileWarning', () => {
    it('names the day and the pack a colleague gets instead', () => {
        expect(sharedInFileWarning({ at: '2026-10-27T15:00:00.000Z', originName: 'bodea' })).toBe(
            "You shared this pack in a project file on 27 October. Anyone who hasn't created that project yet will get bodea instead.",
        );
    });

    it('says no sample data when the pack was made from nothing', () => {
        expect(sharedInFileWarning({ at: '2026-10-27T15:00:00.000Z' })).toBe(
            "You shared this pack in a project file on 27 October. Anyone who hasn't created that project yet will get no sample data instead.",
        );
    });
});
