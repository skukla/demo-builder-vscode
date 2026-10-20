/**
 * refreshBaseFromColleague — after the colleague's own update, take their saved base when it
 * is ahead of ours; otherwise leave ours (EDS-56 D4).
 *
 * The description file is built from the real type and read by the real parser, so a file
 * that would not parse in production does not parse here either.
 */

import { COMPONENT_IDS } from '@/core/constants';
import { readBoilerplateBase, writeBoilerplateBase, type BoilerplateBase } from '@/features/updates/services/boilerplateBase';
import { refreshBaseFromColleague, type BaseRefreshDeps } from '@/features/updates/services/boilerplateBaseRefresh';
import type { Project } from '@/types/base';
import { SHARED_DEMO_FILE_VERSION, type SharedDemoDescription } from '@/types/projectFile';
import { makeAddedDemo } from '../../../helpers/demoPackageFixtures';
import { createMockProject } from '../../../helpers/projectFake';

const B2B = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };
const OURS = '71a67e027b4b288a67f5cda1fc106d2df9a34805';
const THEIRS = '48bed04d072fff094b49a46709b351bd719b287a';
const BASE: BoilerplateBase = {
    template: B2B,
    commit: OURS,
    lkgSource: { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' },
    found: 'first-commit',
};

function colleagueProject(): Project {
    const project = createMockProject({
        name: 'justrite',
        demo: makeAddedDemo({ source: { owner: 'kmanns', repo: 'justrite', branch: 'main' } }),
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: { id: COMPONENT_IDS.EDS_STOREFRONT, name: 'EDS Storefront', type: 'frontend', status: 'ready', metadata: {} },
        },
    });
    writeBoilerplateBase(project, BASE);
    return project;
}

function descriptionFile(builtWith: SharedDemoDescription['builtWith']): string {
    const file: SharedDemoDescription = {
        kind: 'demo',
        version: SHARED_DEMO_FILE_VERSION,
        name: 'Justrite',
        contentSource: { org: 'kmanns', site: 'justrite', indexPath: '/sitemap.json' },
        ...(builtWith ? { builtWith } : {}),
    };
    return JSON.stringify(file);
}

function deps(file: string | undefined, aheadBy = 73): BaseRefreshDeps & { readFile: jest.Mock; compare: jest.Mock } {
    return {
        readFile: jest.fn(async () => file),
        compare: jest.fn(async () => ({ ahead_by: aheadBy })),
    };
}

describe('refreshBaseFromColleague', () => {
    it("takes the colleague's saved base when it is ahead of ours, read from their repository's branch", async () => {
        const project = colleagueProject();
        const d = deps(descriptionFile({ template: B2B, lkg: THEIRS, extension: '1.0.0' }));

        await expect(refreshBaseFromColleague(project, d)).resolves.toBe(true);

        expect(readBoilerplateBase(project)).toEqual({ ...BASE, commit: THEIRS, found: 'built-with' });
        expect(d.readFile).toHaveBeenCalledWith('kmanns', 'justrite', 'demo.demo-builder.json', 'main');
        expect(d.compare).toHaveBeenCalledWith('adobe-commerce', 'boilerplate-b2b-template', OURS, THEIRS);
    });

    it.each([
        ['no description file', undefined, 73],
        ['a file that does not parse', '{not json', 73],
        ['a file with no base', descriptionFile(undefined), 73],
        ['a base on another template', descriptionFile({ template: { owner: 'someone', repo: 'other' }, lkg: THEIRS, extension: '1' }), 73],
        ['the same base', descriptionFile({ template: B2B, lkg: OURS, extension: '1' }), 73],
        // Never backwards: a colleague file older than our record is left alone.
        ['a base that is not ahead of ours', descriptionFile({ template: B2B, lkg: THEIRS, extension: '1' }), 0],
    ])('leaves the base for %s', async (_label, file, aheadBy) => {
        const project = colleagueProject();

        await expect(refreshBaseFromColleague(project, deps(file, aheadBy))).resolves.toBe(false);

        expect(readBoilerplateBase(project)).toEqual(BASE);
    });
});
