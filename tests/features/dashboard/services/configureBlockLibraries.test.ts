/**
 * Block libraries on Configure (EDS-39) — the two host-side halves.
 *
 * `buildBlockLibraryChoices` is what the screen is offered: the same lists the
 * creation wizard derives, read from the REAL bundled catalog so a library that
 * is native to a package can never be offered as a tick box here.
 *
 * `applyBlockLibrarySelection` is what Save records. It only records: nothing
 * here installs or removes block files, and the installed record is not its to
 * touch. Installing and removing after Save is `configureBlockLibraryWork`.
 */

import {
    applyBlockLibrarySelection,
    buildBlockLibraryChoices,
} from '@/features/dashboard/services/configureBlockLibraries';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';
import type { CustomBlockLibrary, InstalledBlockLibrary } from '@/types/blockLibraries';
import { createMockProject } from '../../../helpers/projectFake';

const CUSTOM: CustomBlockLibrary = {
    name: 'My Blocks',
    source: { owner: 'acme', repo: 'my-blocks', branch: 'main' },
};

function edsProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        selectedStack: 'eds-accs',
        selectedPackage: 'citisignal',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                status: 'ready',
            },
        },
        ...overrides,
    });
}

describe('buildBlockLibraryChoices', () => {
    it('offers the libraries the wizard offers for the project stack and package', () => {
        const choices = buildBlockLibraryChoices(edsProject(), []);

        expect(choices.available.map((lib) => lib.id)).toEqual([
            'demo-team-blocks',
            'demo-builder-blocks',
        ]);
        expect(choices.native).toStrictEqual([]);
    });

    it('lists a library native to the package as native, never as a choice', () => {
        const choices = buildBlockLibraryChoices(edsProject({ selectedPackage: 'bodea' }), []);

        expect(choices.native.map((lib) => lib.id)).toEqual(['bodea-blocks']);
        expect(choices.available.map((lib) => lib.id)).not.toContain('bodea-blocks');
    });

    it('offers nothing for a stack that is not Edge Delivery', () => {
        const choices = buildBlockLibraryChoices(
            edsProject({ selectedStack: 'headless-paas' }),
            ['https://github.com/acme/my-blocks'],
        );

        expect(choices).toEqual({ native: [], available: [], customDefaults: [] });
    });

    it('offers nothing when the project names a stack the catalog does not have', () => {
        const choices = buildBlockLibraryChoices(edsProject({ selectedStack: 'gone' }), []);

        expect(choices).toEqual({ native: [], available: [], customDefaults: [] });
    });

    it('offers the custom libraries from the setting, skipping an address it cannot read', () => {
        const choices = buildBlockLibraryChoices(edsProject(), [
            'https://github.com/acme/my-blocks',
            'not a repository',
        ]);

        expect(choices.customDefaults.map((lib) => lib.source)).toEqual([
            expect.objectContaining({ owner: 'acme', repo: 'my-blocks' }),
        ]);
    });
});

describe('buildBlockLibraryChoices — a setting that is not a list', () => {
    it('offers no custom libraries rather than failing to open the screen', () => {
        const choices = buildBlockLibraryChoices(edsProject(), 3000);

        expect(choices.customDefaults).toStrictEqual([]);
        expect(choices.available.length).toBeGreaterThan(0);
    });
});

describe('applyBlockLibrarySelection', () => {
    it('records a newly ticked library and reports the change', () => {
        const project = edsProject({ selectedBlockLibraries: ['demo-team-blocks'] });

        const changed = applyBlockLibrarySelection(project, {
            selectedBlockLibraries: ['demo-team-blocks', 'demo-builder-blocks'],
        });

        expect(changed).toBe(true);
        expect(project.selectedBlockLibraries).toEqual(['demo-team-blocks', 'demo-builder-blocks']);
    });

    it('records an unticked library as gone and leaves the installed record alone', () => {
        const installed: InstalledBlockLibrary[] = [
            {
                name: 'Demo Builder Blocks',
                source: { owner: 'o', repo: 'r', branch: 'main' },
                commitSha: 'abc',
                blockIds: ['catalog-menu'],
                installedAt: '2026-10-01T00:00:00.000Z',
            },
        ];
        const project = edsProject({
            selectedBlockLibraries: ['demo-builder-blocks'],
            installedBlockLibraries: installed,
        });

        const changed = applyBlockLibrarySelection(project, { selectedBlockLibraries: [] });

        expect(changed).toBe(true);
        expect(project.selectedBlockLibraries).toStrictEqual([]);
        expect(project.installedBlockLibraries).toEqual(installed);
    });

    it('records the custom libraries it is handed', () => {
        const project = edsProject();

        const changed = applyBlockLibrarySelection(project, { customBlockLibraries: [CUSTOM] });

        expect(changed).toBe(true);
        expect(project.customBlockLibraries).toEqual([CUSTOM]);
    });

    it('changes nothing when the save carries no selection', () => {
        const project = edsProject({
            selectedBlockLibraries: ['demo-team-blocks'],
            customBlockLibraries: [CUSTOM],
        });

        expect(applyBlockLibrarySelection(project, {})).toBe(false);
        expect(project.selectedBlockLibraries).toEqual(['demo-team-blocks']);
        expect(project.customBlockLibraries).toEqual([CUSTOM]);
    });

    it('reports no change when the selection is what the project already has', () => {
        const project = edsProject({ selectedBlockLibraries: ['demo-team-blocks'] });

        const changed = applyBlockLibrarySelection(project, {
            selectedBlockLibraries: ['demo-team-blocks'],
        });

        expect(changed).toBe(false);
    });

    it('refuses a project that is not Edge Delivery', () => {
        const project = createMockProject({ selectedStack: 'headless-paas' });

        const changed = applyBlockLibrarySelection(project, {
            selectedBlockLibraries: ['demo-builder-blocks'],
        });

        expect(changed).toBe(false);
        expect(project.selectedBlockLibraries).toBeUndefined();
    });

    it('drops entries that are not what the field holds, and repeats', () => {
        const project = edsProject();
        // What a malformed message could carry: the handler is the boundary.
        const selectedBlockLibraries: unknown = ['demo-builder-blocks', 7, '', 'demo-builder-blocks'];
        const customBlockLibraries: unknown = [CUSTOM, { name: 'no source' }, 'text'];

        applyBlockLibrarySelection(project, { selectedBlockLibraries, customBlockLibraries });

        expect(project.selectedBlockLibraries).toEqual(['demo-builder-blocks']);
        expect(project.customBlockLibraries).toEqual([CUSTOM]);
    });

    it('ignores a selection that is not a list at all', () => {
        const project = edsProject({ selectedBlockLibraries: ['demo-team-blocks'] });

        const changed = applyBlockLibrarySelection(project, {
            selectedBlockLibraries: 'demo-builder-blocks',
        });

        expect(changed).toBe(false);
        expect(project.selectedBlockLibraries).toEqual(['demo-team-blocks']);
    });
});
