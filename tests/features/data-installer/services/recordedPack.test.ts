/**
 * Can a project's recorded pack be read, and what does creation install when it cannot
 * (datapack-engine step 07)? The order is the plan's: the pack, else the pack it was made
 * from, else that pack's newest version, else no sample data, each said plainly.
 *
 * "Not there" is the store's 404 (the library's `get-datapack-metadata` answers 404 for a
 * pack it holds no visible copy of: accs-discovery-service, read from its code); any other
 * failure means the store could not be asked, and the pack is left as recorded.
 */

import { availabilityOf, checkRecordedPack, type PackReads } from '@/features/data-installer/services/recordedPack';
import { DataInstallerApiError } from '@/features/data-installer/services/dataInstallerErrors';
import type { DatapackSummary } from '@/features/data-installer/types';
import type { DatapackId, DatapackStoreName, ProjectDatapack } from '@/types/datapack';

const summary = (id: DatapackId, over: Partial<DatapackSummary> = {}): DatapackSummary => ({
    id,
    displayName: id.name === 'bodea' ? 'Bodea' : 'Acme Demo',
    shared: false,
    dataTypes: ['products'],
    art: {},
    ...over,
});

const NOT_FOUND = new DataInstallerApiError('not found', 404, 'get-datapack-metadata');

const ACME: ProjectDatapack = {
    name: 'acme-demo-1a2b3c',
    version: '20261029-183000',
    store: 'library',
    origin: { name: 'bodea', version: '1.0.0', store: 'installer' },
};

/** Reads that hold exactly the listed packs, per store. */
function reads(held: Array<{ id: DatapackId; store: DatapackStoreName; over?: Partial<DatapackSummary> }>): jest.Mocked<PackReads> {
    return {
        detail: jest.fn(async (id, store) => {
            const found = held.find((h) => h.store === store && h.id.name === id.name && h.id.version === id.version);
            if (!found) throw NOT_FOUND;
            return summary(found.id, found.over);
        }),
        versions: jest.fn(async (name, store) =>
            held.filter((h) => h.store === store && h.id.name === name).map((h) => summary(h.id, h.over)),
        ),
    };
}

describe('checkRecordedPack', () => {
    it('answers readable, with whose it is, when the store holds the pack', async () => {
        const r = reads([{ id: ACME, store: 'library', over: { mine: true } }]);

        await expect(checkRecordedPack(r, ACME)).resolves.toEqual({
            verdict: 'readable',
            pack: ACME,
            displayName: 'Acme Demo',
            mine: true,
            shared: false,
        });
        expect(r.detail).toHaveBeenCalledWith({ name: 'acme-demo-1a2b3c', version: '20261029-183000' }, 'library');
    });

    it('reads a pack recorded with no store from the Data Installer when the datapack store has none', async () => {
        const r = reads([{ id: { name: 'bodea', version: 'main' }, store: 'installer' }]);

        await expect(checkRecordedPack(r, { name: 'bodea', version: 'main' })).resolves.toMatchObject({ verdict: 'readable' });
        expect(r.detail.mock.calls.map((call) => call[1])).toEqual(['library', 'installer']);
    });

    // Rule 3: a project saved before the store was recorded may name a library version (the old
    // "-saved-" ones), found by asking the datapack store first as every pack now is.
    it('finds a pack recorded with no store in the datapack store, and names that store', async () => {
        const saved = { name: 'bodea', version: 'main-saved-20261029-1830' };
        const r = reads([{ id: saved, store: 'library', over: { mine: true } }]);

        await expect(checkRecordedPack(r, saved)).resolves.toMatchObject({ verdict: 'readable', pack: { ...saved, store: 'library' }, mine: true });
        expect(r.detail.mock.calls.map((call) => call[1])).toEqual(['library']);
    });

    describe("the datapack store's copy of a pack recorded in the Data Installer", () => {
        const RECORDED: ProjectDatapack = { name: 'frescopa', version: 'main', store: 'installer' };

        it('wins when both hold it, and the Data Installer is not asked', async () => {
            const r = reads([
                { id: RECORDED, store: 'library' },
                { id: RECORDED, store: 'installer' },
            ]);

            await expect(checkRecordedPack(r, RECORDED)).resolves.toMatchObject({
                verdict: 'readable',
                pack: { name: 'frescopa', version: 'main', store: 'library' },
            });
            expect(r.detail.mock.calls.map((call) => call[1])).toEqual(['library']);
        });

        it('survives a Data Installer that refuses', async () => {
            const r = reads([{ id: RECORDED, store: 'library' }]);
            const held = r.detail.getMockImplementation();
            r.detail.mockImplementation(async (id, store) => {
                if (store === 'installer') throw new DataInstallerApiError('refused', 403, 'get-datapack-metadata');
                return held!(id, store);
            });

            await expect(checkRecordedPack(r, RECORDED)).resolves.toMatchObject({ verdict: 'readable', pack: { store: 'library' } });
        });

        it('counts a refused datapack store read as none there, and asks the Data Installer', async () => {
            const r = reads([{ id: RECORDED, store: 'installer' }]);
            const held = r.detail.getMockImplementation();
            r.detail.mockImplementation(async (id, store) => {
                if (store === 'library') throw new DataInstallerApiError('refused', 403, 'get-datapack-metadata');
                return held!(id, store);
            });

            await expect(checkRecordedPack(r, RECORDED)).resolves.toMatchObject({ verdict: 'readable', pack: RECORDED });
        });

        it('CONTROL: a pack recorded in the datapack store never asks the Data Installer', async () => {
            const r = reads([{ id: { name: 'acme', version: '1' }, store: 'installer' }]);

            await checkRecordedPack(r, { name: 'acme', version: '1', store: 'library' });

            expect(r.detail.mock.calls.map((call) => call[1])).not.toContain('installer');
        });
    });

    // Phase 2, step-02 slice 2: a datapack is always its latest save (D3), and only two saves are
    // kept, so a project naming a save that has gone uses the same datapack's newest save: the
    // changes are in it, and nothing needs saying.
    it("uses the same datapack's newest save when the save it names has gone", async () => {
        const r = reads([
            { id: { name: ACME.name, version: '20261110-091500' }, store: 'library', over: { updatedAt: '2026-11-10T09:15:00Z', mine: true, shared: true } },
            { id: { name: ACME.name, version: '20261105-103000' }, store: 'library', over: { updatedAt: '2026-11-05T10:30:00Z', mine: true, shared: true } },
            { id: { name: 'bodea', version: '1.0.0' }, store: 'installer' },
        ]);

        await expect(checkRecordedPack(r, ACME)).resolves.toEqual({
            verdict: 'readable',
            pack: { name: ACME.name, version: '20261110-091500', store: 'library' },
            displayName: 'Acme Demo',
            mine: true,
            shared: true,
        });
    });

    it('falls back to the datapack it was made from, saying the changes are not included', async () => {
        const r = reads([{ id: { name: 'bodea', version: '1.0.0' }, store: 'installer' }]);

        await expect(checkRecordedPack(r, ACME)).resolves.toEqual({
            verdict: 'fallback',
            pack: { name: 'bodea', version: '1.0.0', store: 'installer' },
            displayName: 'Bodea',
            note: "The acme-demo-1a2b3c datapack this project uses can't be read: its owner has deleted it or not shared it. You can continue with Bodea, the datapack it was made from; their changes won't be included.",
        });
    });

    it("uses the newest version of the datapack it was made from when that version has gone too, and says so", async () => {
        const r = reads([
            { id: { name: 'bodea', version: '2.0.0' }, store: 'installer', over: { updatedAt: '2026-10-20T00:00:00Z' } },
            { id: { name: 'bodea', version: '1.5.0' }, store: 'installer', over: { updatedAt: '2026-09-01T00:00:00Z' } },
        ]);

        const check = await checkRecordedPack(r, ACME);

        expect(check).toMatchObject({ verdict: 'fallback', pack: { name: 'bodea', version: '2.0.0', store: 'installer' } });
        expect(check.verdict === 'fallback' && check.note).toContain("Bodea version 1.0.0 has gone too, so its newest version, 2.0.0, is used");
    });

    it('continues without a datapack when the datapack it was made from has gone entirely, and says why', async () => {
        await expect(checkRecordedPack(reads([]), ACME)).resolves.toEqual({
            verdict: 'none',
            note: "The acme-demo-1a2b3c datapack this project uses can't be read: its owner has deleted it or not shared it. The datapack it was made from, bodea, has gone too, so this project will be created without a datapack.",
        });
    });

    it('continues without a datapack when there is no pack it was made from', async () => {
        const check = await checkRecordedPack(reads([]), { name: 'gone', version: '1', store: 'library' });

        expect(check).toEqual({
            verdict: 'none',
            note: "The gone datapack this project uses can't be read: its owner has deleted it or not shared it. This project will be created without a datapack.",
        });
    });

    it('leaves the pack as recorded when the store cannot be asked', async () => {
        const r = reads([]);
        r.detail.mockRejectedValue(new Error('network down'));

        await expect(checkRecordedPack(r, ACME)).resolves.toEqual({ verdict: 'unknown' });
        expect(r.versions).not.toHaveBeenCalled();
    });
});

// The demo package check (research item 3): asked of both stores, by name AND version.
describe('availabilityOf', () => {
    it('finds a Data Installer pack by its version, not its name alone', async () => {
        const r = reads([{ id: { name: 'bodea', version: 'main' }, store: 'installer' }]);

        await expect(availabilityOf(r, { name: 'bodea', version: 'main' })).resolves.toBe('installer');
        await expect(availabilityOf(r, { name: 'bodea', version: 'main-saved-20261029-1830' })).resolves.toBe('missing');
    });

    it('asks the store recorded first, then the other', async () => {
        const r = reads([{ id: ACME, store: 'library', over: { shared: true } }]);

        await expect(availabilityOf(r, ACME)).resolves.toBe('library-shared');
        expect(r.detail.mock.calls[0][1]).toBe('library');
    });

    it('finds a library version recorded with no store, as packs saved before the store was recorded are', async () => {
        const r = reads([{ id: { name: 'bodea', version: 'main-saved-20261029-1830' }, store: 'library', over: { mine: true } }]);

        await expect(availabilityOf(r, { name: 'bodea', version: 'main-saved-20261029-1830' })).resolves.toBe('library-yours-only');
        expect(r.detail.mock.calls.map((call) => call[1])).toEqual(['installer', 'library']);
    });

    it('cannot say when a store could not be asked and the other has no copy', async () => {
        const r = reads([]);
        r.detail.mockImplementation(async (_id, store) => {
            throw store === 'library' ? new Error('network down') : NOT_FOUND;
        });

        await expect(availabilityOf(r, ACME)).resolves.toBeUndefined();
    });
});
