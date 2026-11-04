/**
 * Where a save from a demo goes, Save and Save As (owner, 2026-11-03,
 * `.rptc/plans/datapack-save-as/`): a new pack's generated name, the version a save makes, the pack
 * it records it was made from, and what the project then records.
 */

import {
    myVersions,
    packIdFor,
    planSave,
    recordSave,
    savedVersion,
} from '@/features/data-installer/services/demoPack';
import type { Project } from '@/types/base';
import type { DatapackSummary } from '@/features/data-installer/types';
import { createMockProject } from '../../../helpers/projectFake';

const AT = new Date('2026-10-29T18:30:05Z');
const BODEA = { name: 'bodea', version: 'main', store: 'installer' as const };

function project(over: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'acme-demo',
        title: 'Acme Demo',
        path: '/Users/sc/.demo-builder/projects/acme-demo',
        created: new Date('2026-10-01T00:00:00Z'),
        ...over,
    });
}

describe('packIdFor', () => {
    it('is a slug of the name typed and a short random suffix', () => {
        expect(packIdFor('My Bodea', '3f9a1c')).toBe('my-bodea-3f9a1c');
        expect(packIdFor('My Bodea')).toMatch(/^my-bodea-[0-9a-f]{6}$/u);
    });

    it('never makes the same name twice for the same words', () => {
        expect(packIdFor('My Bodea')).not.toBe(packIdFor('My Bodea'));
    });

    it('keeps only letters and digits, and has a name even when nothing is left', () => {
        expect(packIdFor('  Café — Q4!  ', 'abc123')).toBe('cafe-q4-abc123');
        expect(packIdFor('!!!', 'abc123')).toBe('datapack-abc123');
    });
});

describe('savedVersion', () => {
    it('is the UTC time to the second, so two saves in a minute never collide', () => {
        expect(savedVersion(AT)).toBe('20261029-183005');
    });
});

describe('planSave', () => {
    it('makes Save As a new pack under the name typed, made from the pack installed', () => {
        const save = planSave(project({ datapack: BODEA }), BODEA, { displayName: 'My Bodea' }, AT);

        expect(save.id).toEqual({ name: expect.stringMatching(/^my-bodea-[0-9a-f]{6}$/u), version: '20261029-183005' });
        expect(save.displayName).toBe('My Bodea');
        expect(save.origin).toEqual(BODEA);
    });

    it('makes Save a new version of the pack named, keeping the pack it was first made from', () => {
        const mine = { name: 'my-bodea-abc123', version: '20261028-090000', store: 'library' as const, origin: BODEA };
        const save = planSave(project({ datapack: mine }), mine, { name: 'my-bodea-abc123', displayName: 'My Bodea' }, AT);

        expect(save).toEqual({ id: { name: 'my-bodea-abc123', version: '20261029-183005' }, displayName: 'My Bodea', origin: BODEA });
    });

    it('names no pack it was made from for a save of picks alone', () => {
        const save = planSave(project(), undefined, { displayName: 'Hand Built' }, AT);

        expect(save).not.toHaveProperty('origin');
    });
});

describe('recordSave', () => {
    it("records the new version as the project's pack, in the library", () => {
        const recorded = project({ datapack: BODEA });

        recordSave(recorded, { id: { name: 'my-bodea-abc123', version: '20261029-183005' }, displayName: 'My Bodea', origin: BODEA });

        expect(recorded.datapack).toEqual({ name: 'my-bodea-abc123', version: '20261029-183005', store: 'library', origin: BODEA });
    });

    it('records no origin when the save names none', () => {
        const recorded = project();

        recordSave(recorded, { id: { name: 'hand-built-abc123', version: '2' }, displayName: 'Hand Built' });

        expect(recorded.datapack).toEqual({ name: 'hand-built-abc123', version: '2', store: 'library' });
    });
});

describe('myVersions', () => {
    const row = (name: string, version: string, mine?: boolean): DatapackSummary => ({
        id: { name, version },
        displayName: name,
        shared: false,
        dataTypes: [],
        art: {},
        ...(mine ? { mine } : {}),
    });

    it("lists the SC's own versions of the pack, asked by name", async () => {
        const client = {
            findDatapacks: jest.fn().mockResolvedValue({ items: [row('acme', '1', true), row('acme', '2'), row('acme-2', '1', true)], count: 3 }),
        };

        await expect(myVersions(client, 'acme')).resolves.toEqual([{ name: 'acme', version: '1' }]);
        expect(client.findDatapacks).toHaveBeenCalledWith({ datapackName: 'acme' });
    });
});
