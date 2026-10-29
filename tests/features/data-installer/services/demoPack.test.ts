/**
 * Each demo has its own pack (datapack-engine step 07): what a save from a project is
 * called, which version it makes, the pack it records it was made from, and what the
 * project then records.
 */

import {
    demoPackSaveFor,
    myVersions,
    ownPackName,
    recordDemoPackSave,
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

describe('ownPackName', () => {
    it("is the project's slug and a short hash of where and when it was made", () => {
        expect(ownPackName(project())).toMatch(/^acme-demo-[0-9a-f]{6}$/u);
    });

    it('differs for a copy of the same name made somewhere else', () => {
        expect(ownPackName(project())).not.toBe(ownPackName(project({ path: '/Users/other/.demo-builder/projects/acme-demo' })));
    });

    it('is the recorded name once the demo has one', () => {
        expect(ownPackName(project({ ownDatapack: { name: 'acme-demo-abc123' } }))).toBe('acme-demo-abc123');
    });
});

describe('savedVersion', () => {
    it('is the UTC time to the second, so two saves in a minute never collide', () => {
        expect(savedVersion(AT)).toBe('20261029-183005');
    });
});

describe('demoPackSaveFor', () => {
    it('makes a first save into a new pack named for the project, made from the pack installed', () => {
        const save = demoPackSaveFor(project({ datapack: BODEA }), BODEA, AT);

        expect(save).toEqual({
            id: { name: ownPackName(project()), version: '20261029-183005' },
            displayName: 'Acme Demo',
            origin: BODEA,
        });
    });

    it("saves into the demo's own pack again, keeping the pack it was first made from", () => {
        const own = { name: 'acme-demo-abc123', version: '20261028-090000', store: 'library' as const, origin: BODEA };
        const save = demoPackSaveFor(project({ datapack: own, ownDatapack: { name: 'acme-demo-abc123' } }), own, AT);

        expect(save).toEqual({ id: { name: 'acme-demo-abc123', version: '20261029-183005' }, displayName: 'Acme Demo', origin: BODEA });
    });

    it("gives a copy its own pack, made from the template the original's pack came from", () => {
        const originals = { name: 'acme-demo-abc123', version: '20261028-090000', store: 'library' as const, origin: BODEA };
        const copy = project({ name: 'acme-copy', title: 'Acme Copy', path: '/p/acme-copy', datapack: originals });

        const save = demoPackSaveFor(copy, originals, AT);

        expect(save.id.name).toMatch(/^acme-copy-[0-9a-f]{6}$/u);
        expect(save.displayName).toBe('Acme Copy');
        expect(save.origin).toEqual(BODEA);
    });

    it('keeps the name the SC gave the pack once they renamed it', () => {
        const own = { name: 'acme-demo-abc123', version: '1', store: 'library' as const };
        const renamed = project({ datapack: own, ownDatapack: { name: 'acme-demo-abc123', displayName: 'Acme Q4', renamed: true } });
        const followed = project({ datapack: own, ownDatapack: { name: 'acme-demo-abc123', displayName: 'Old title' } });

        expect(demoPackSaveFor(renamed, own, AT).displayName).toBe('Acme Q4');
        expect(demoPackSaveFor(followed, own, AT).displayName).toBe('Acme Demo');
    });
});

describe('recordDemoPackSave', () => {
    it("records the new version as the project's pack, in the library, and the demo's own pack", () => {
        const recorded = project({ datapack: BODEA });

        recordDemoPackSave(recorded, { id: { name: 'acme-demo-abc123', version: '20261029-183005' }, displayName: 'Acme Demo', origin: BODEA });

        expect(recorded.datapack).toEqual({ name: 'acme-demo-abc123', version: '20261029-183005', store: 'library', origin: BODEA });
        expect(recorded.ownDatapack).toEqual({ name: 'acme-demo-abc123', displayName: 'Acme Demo' });
    });

    it('keeps "renamed" across saves', () => {
        const recorded = project({ ownDatapack: { name: 'acme-demo-abc123', renamed: true } });

        recordDemoPackSave(recorded, { id: { name: 'acme-demo-abc123', version: '2' }, displayName: 'Acme Q4' });

        expect(recorded.ownDatapack).toEqual({ name: 'acme-demo-abc123', displayName: 'Acme Q4', renamed: true });
        expect(recorded.datapack).not.toHaveProperty('origin');
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
