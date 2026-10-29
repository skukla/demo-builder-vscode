/**
 * What creation does with a project's recorded pack before installing it (step 07): a
 * colleague's own demo pack is copied into this SC's library as this demo's own pack, so the
 * new demo stands alone; a pack that cannot be read is replaced by the pack it was made from,
 * or by none; every change is said in one line.
 */

import { settleArrivingPack, type ArrivalDeps } from '@/features/data-installer/services/arrivingPack';
import type { ProjectDatapack, RecordedPackCheck } from '@/types/datapack';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const COLLEAGUES = { name: 'priya-acme-9f8e7d', version: '20261028-090000', store: 'library' as const, origin: { name: 'bodea', version: 'main' } };
const AT = new Date('2026-10-29T18:30:05Z');

function project(over: Partial<Project> = {}): Project {
    return createMockProject({ name: 'acme', title: 'Acme', path: '/p/acme', created: new Date('2026-10-29T00:00:00Z'), datapack: COLLEAGUES, ...over });
}

type CopyFn = ArrivalDeps['copy'];

function deps(check: RecordedPackCheck, copy = jest.fn<ReturnType<CopyFn>, Parameters<CopyFn>>(async () => undefined)) {
    return { check: jest.fn<Promise<RecordedPackCheck>, [ProjectDatapack]>(async () => check), copy, now: () => AT };
}

const readable = (over: Partial<Extract<RecordedPackCheck, { verdict: 'readable' }>> = {}): RecordedPackCheck => ({
    verdict: 'readable',
    pack: COLLEAGUES,
    displayName: 'Priya Acme',
    mine: false,
    shared: false,
    ...over,
});

describe('settleArrivingPack', () => {
    it("copies a colleague's own pack into this SC's library as this demo's pack, then records it", async () => {
        const p = project();
        const d = deps(readable());

        const result = await settleArrivingPack(p, d);

        expect(d.copy).toHaveBeenCalledWith(
            { name: COLLEAGUES.name, version: COLLEAGUES.version },
            { id: { name: expect.stringMatching(/^acme-[0-9a-f]{6}$/u), version: '20261029-183005' }, displayName: 'Acme', origin: COLLEAGUES.origin },
        );
        expect(p.datapack).toEqual({ ...d.copy.mock.calls[0][1].id, store: 'library', origin: COLLEAGUES.origin });
        expect(p.ownDatapack?.name).toBe(p.datapack?.name);
        expect(result).toEqual({ changed: true, note: "Copied Priya Acme into your datapack library as this demo's own pack." });
    });

    it('leaves the SC\'s own pack, a shared one, and a Data Installer one as recorded', async () => {
        for (const check of [readable({ mine: true }), readable({ shared: true }), readable({ pack: { name: 'bodea', version: 'main' } })]) {
            const p = project({ datapack: check.verdict === 'readable' ? check.pack : COLLEAGUES });
            const d = deps(check);

            await expect(settleArrivingPack(p, d)).resolves.toEqual({ changed: false });
            expect(d.copy).not.toHaveBeenCalled();
        }
    });

    it('installs from the colleague\'s pack directly when the copy fails, and says so', async () => {
        const p = project();
        const d = deps(readable(), jest.fn<ReturnType<CopyFn>, Parameters<CopyFn>>(async () => {
            throw new Error('library refused');
        }));

        const result = await settleArrivingPack(p, d);

        expect(p.datapack).toEqual(COLLEAGUES);
        expect(p.ownDatapack).toBeUndefined();
        expect(result).toEqual({ changed: false, note: 'Priya Acme could not be copied into your datapack library (library refused), so it is installed from where it is.' });
    });

    it('records the store the check found a pack recorded with no store in', async () => {
        const saved = { name: 'bodea', version: 'main-saved-20261029-1830' };
        const p = project({ datapack: saved });

        const result = await settleArrivingPack(p, deps(readable({ pack: { ...saved, store: 'library' }, mine: true })));

        expect(p.datapack).toEqual({ ...saved, store: 'library' });
        expect(result).toEqual({ changed: true });
    });

    it('installs the pack it was made from when the recorded one cannot be read', async () => {
        const p = project();
        const d = deps({ verdict: 'fallback', pack: { name: 'bodea', version: 'main' }, displayName: 'Bodea', note: 'Fallback note.' });

        await expect(settleArrivingPack(p, d)).resolves.toEqual({ changed: true, note: 'Fallback note.' });
        expect(p.datapack).toEqual({ name: 'bodea', version: 'main' });
    });

    it('creates the project without sample data when nothing can be read, saying why', async () => {
        const p = project();

        await expect(settleArrivingPack(p, deps({ verdict: 'none', note: 'None note.' }))).resolves.toEqual({ changed: true, note: 'None note.' });
        expect(p.datapack).toBeUndefined();
    });

    it('changes nothing when the store could not be asked, or there is no pack', async () => {
        const p = project();
        await expect(settleArrivingPack(p, deps({ verdict: 'unknown' }))).resolves.toEqual({ changed: false });
        expect(p.datapack).toEqual(COLLEAGUES);

        const none = deps({ verdict: 'unknown' });
        await expect(settleArrivingPack(project({ datapack: undefined }), none)).resolves.toEqual({ changed: false });
        expect(none.check).not.toHaveBeenCalled();
    });
});
