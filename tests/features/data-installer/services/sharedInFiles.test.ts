/**
 * "Shared in a file" (datapack-engine step 07): exporting a project whose pack is in the
 * datapack library records when, so deleting that pack later warns that anyone who has not
 * created the project yet will get the pack it was made from instead.
 */

import type { PackReads } from '@/features/data-installer/services/recordedPack';
import {
    SHARED_IN_FILES_KEY,
    type SharedInFilesMemento,
    originDisplayName,
    recordSharedInFile,
    sharedInFile,
    sharedInFileWarning,
} from '@/features/data-installer/services/sharedInFiles';
import type { DatapackSummary } from '@/features/data-installer/types';

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
            'acme-demo-1a2b3c@20261029-183005': { at: '2026-10-27T15:00:00.000Z', origin: { name: 'bodea', version: 'main' } },
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
        const m = memento({ 'acme@1': { at: '2026-10-27T15:00:00.000Z', origin: { name: 'bodea', version: 'main' } } });

        expect(sharedInFile(m, { name: 'acme', version: '1' })).toEqual({
            at: '2026-10-27T15:00:00.000Z',
            origin: { name: 'bodea', version: 'main' },
        });
        expect(sharedInFile(m, { name: 'acme', version: '2' })).toBeUndefined();
    });

    it('reads an entry recorded before the origin was (its name only) as an origin with that name', () => {
        const m = memento({ 'acme@1': { at: '2026-10-27T15:00:00.000Z', originName: 'bodea' } });

        expect(sharedInFile(m, { name: 'acme', version: '1' })).toEqual({ at: '2026-10-27T15:00:00.000Z', origin: { name: 'bodea' } });
    });

    it('reads anything that is not a record of entries as nothing recorded', () => {
        expect(sharedInFile(memento(true), { name: 'acme', version: '1' })).toBeUndefined();
        expect(sharedInFile(memento({ 'acme@1': 'yes' }), { name: 'acme', version: '1' })).toBeUndefined();
    });
});

describe('sharedInFileWarning', () => {
    const ENTRY = { at: '2026-10-27T15:00:00.000Z', origin: { name: 'frescopa', version: 'main', store: 'library' as const } };

    it('names the day and the pack a colleague gets instead, by the name the SC sees', () => {
        expect(sharedInFileWarning(ENTRY, 'Frescopa')).toBe(
            "You shared this pack in a project file on 27 October. Anyone who hasn't created that project yet will get Frescopa instead.",
        );
    });

    it('never names the pack by its id: with no name to show, it says what the pack is', () => {
        expect(sharedInFileWarning(ENTRY)).toBe(
            "You shared this pack in a project file on 27 October. Anyone who hasn't created that project yet will get the pack it was made from instead.",
        );
    });

    it('says no sample data when the pack was made from nothing', () => {
        expect(sharedInFileWarning({ at: '2026-10-27T15:00:00.000Z' })).toBe(
            "You shared this pack in a project file on 27 October. Anyone who hasn't created that project yet will get no sample data instead.",
        );
    });
});

describe('originDisplayName', () => {
    const row = (name: string, version: string, displayName: string): DatapackSummary =>
        ({ id: { name, version }, displayName, shared: true, dataTypes: [], art: {} }) as DatapackSummary;

    function reads(byStore: Partial<Record<'installer' | 'library', DatapackSummary[] | Error>>): PackReads & { versions: jest.Mock } {
        return {
            detail: jest.fn(),
            versions: jest.fn(async (_name: string, store: 'installer' | 'library') => {
                const answer = byStore[store] ?? [];
                if (answer instanceof Error) throw answer;
                return answer;
            }),
        };
    }

    it('asks the store the origin is in, by its name, and answers that version\'s display name', async () => {
        const r = reads({ library: [row('frescopa', 'v2', 'Frescopa 2'), row('frescopa', 'main', 'Frescopa')] });

        const name = await originDisplayName({ at: AT.toISOString(), origin: { name: 'frescopa', version: 'main', store: 'library' } }, r);

        expect(name).toBe('Frescopa');
        expect(r.versions).toHaveBeenCalledWith('frescopa', 'library');
        expect(r.versions).toHaveBeenCalledTimes(1);
    });

    it('asks the library, then the Data Installer, for an origin recorded with no store', async () => {
        const r = reads({ library: [], installer: [row('bodea', 'main', 'Bodea')] });

        expect(await originDisplayName({ at: AT.toISOString(), origin: { name: 'bodea' } }, r)).toBe('Bodea');
        expect(r.versions.mock.calls).toEqual([
            ['bodea', 'library'],
            ['bodea', 'installer'],
        ]);
    });

    it('ignores a row for another pack the store lists under a similar name', async () => {
        const r = reads({ library: [row('bodea-extra', 'main', 'Bodea Extra')] });

        expect(await originDisplayName({ at: AT.toISOString(), origin: { name: 'bodea', store: 'library' } }, r)).toBeUndefined();
    });

    it('answers nothing when the store cannot be asked, or there is no origin', async () => {
        const r = reads({ library: new Error('unreachable') });

        expect(await originDisplayName({ at: AT.toISOString(), origin: { name: 'bodea', store: 'library' } }, r)).toBeUndefined();
        expect(await originDisplayName({ at: AT.toISOString() }, r)).toBeUndefined();
    });
});
