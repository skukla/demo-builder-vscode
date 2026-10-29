/**
 * otherProjectsPublishingTo — which other local projects publish to a GitHub repository
 * (EDS-26: product pages are left alone when there is one).
 *
 * The state manager is the boundary: a list of project folders and the manifest each
 * loads. What is asserted is the comparison (the repository, whatever its casing; never
 * the project being acted on) and that the manifests are read without re-saving them.
 */

import { COMPONENT_IDS } from '@/core/constants';
import {
    otherProjectsPublishingTo,
    projectsSharingRepo,
} from '@/features/eds/services/storefront/sharedRepoProjects';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';

function storefront(name: string, githubRepo: string | undefined): Project {
    return createMockProject({
        name,
        path: `/projects/${name}`,
        selectedStack: 'eds-accs',
        componentSelections: { frontend: COMPONENT_IDS.EDS_STOREFRONT },
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: githubRepo ? { githubRepo } : {},
            },
        },
    });
}

function stateWith(projects: Project[]) {
    const loadProjectFromPath = jest.fn(async (path: string) => projects.find((p) => p.path === path) ?? null);
    const stateManager = createMockStateManager({
        getAllProjects: jest
            .fn()
            .mockResolvedValue(projects.map((p) => ({ name: p.name, path: p.path, lastModified: new Date(0) }))),
        loadProjectFromPath,
    });
    return { stateManager, loadProjectFromPath };
}

describe('otherProjectsPublishingTo', () => {
    it('names the other projects on the repository, and never the one being acted on', async () => {
        const { stateManager } = stateWith([
            storefront('justrite', 'skukla/kukla-justrite'),
            storefront('justrite-b2b', 'skukla/kukla-justrite'),
            storefront('bodea', 'skukla/kukla-bodea'),
            createMockProject({ name: 'headless', path: '/projects/headless' }),
        ]);

        expect(await otherProjectsPublishingTo(stateManager, 'skukla/kukla-justrite', '/projects/justrite')).toStrictEqual([
            'justrite-b2b',
        ]);
    });

    it('answers none when the repository is the project\'s alone', async () => {
        const { stateManager } = stateWith([
            storefront('justrite', 'skukla/kukla-justrite'),
            storefront('bodea', 'skukla/kukla-bodea'),
        ]);

        expect(await otherProjectsPublishingTo(stateManager, 'skukla/kukla-justrite', '/projects/justrite')).toStrictEqual(
            [],
        );
    });

    it('compares the repository whatever its casing', async () => {
        const { stateManager } = stateWith([storefront('other', 'SKukla/Kukla-Justrite')]);

        expect(await otherProjectsPublishingTo(stateManager, 'skukla/kukla-justrite', '/projects/justrite')).toStrictEqual([
            'other',
        ]);
    });

    it('names every project on the repository when no project is being acted on', async () => {
        const { stateManager } = stateWith([
            storefront('a', 'skukla/shared'),
            storefront('b', 'skukla/shared'),
        ]);

        expect(await otherProjectsPublishingTo(stateManager, 'skukla/shared')).toStrictEqual(['a', 'b']);
    });

    it('reads the manifests without saving them or moving the open project', async () => {
        const { stateManager, loadProjectFromPath } = stateWith([storefront('a', 'skukla/shared')]);

        await otherProjectsPublishingTo(stateManager, 'skukla/shared');

        expect(loadProjectFromPath).toHaveBeenCalledWith('/projects/a', expect.any(Function), {
            persistAfterLoad: false,
        });
        expect(stateManager.saveProject).not.toHaveBeenCalled();
    });
});

describe('projectsSharingRepo (an action on a site, not on a project)', () => {
    it('answers none when one project uses the repository: the site is its own', async () => {
        const { stateManager } = stateWith([storefront('a', 'skukla/shared'), storefront('z', 'skukla/else')]);

        expect(await projectsSharingRepo(stateManager, 'skukla/shared')).toStrictEqual([]);
    });

    it('names them all when two or more do', async () => {
        const { stateManager } = stateWith([storefront('a', 'skukla/shared'), storefront('b', 'skukla/shared')]);

        expect(await projectsSharingRepo(stateManager, 'skukla/shared')).toStrictEqual(['a', 'b']);
    });
});
