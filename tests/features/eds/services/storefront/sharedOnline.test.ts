/**
 * What a delete must not take: the repository or the DA.live site another local project still uses
 * (owner, 2026-11-04). The projects being deleted together never count, so a batch can take a
 * repository only those projects share.
 */

import { createMockStateManager } from '../../../../helpers/stateManagerFake';
import { sharedOnlineOf } from '@/features/eds/services/storefront/sharedRepoProjects';
import type { Project } from '@/types/base';

const storefront = (name: string, path: string, repo: string, site = repo.split('/')[1]) => ({
    name,
    path,
    componentInstances: { 'eds-storefront': { id: 'eds-storefront', metadata: { githubRepo: repo, daLiveOrg: repo.split('/')[0], daLiveSite: site } } },
});

function stateWith(...projects: Array<ReturnType<typeof storefront>>) {
    return createMockStateManager({
        getAllProjects: jest.fn().mockResolvedValue(projects.map(({ name, path }) => ({ name, path, lastModified: new Date(0) }))),
        loadProjectFromPath: jest.fn(async (path: string) => (projects.find((p) => p.path === path) ?? null) as unknown as Project | null),
    });
}

const ACME = { githubRepo: 'acme/demo', daLiveOrg: 'acme', daLiveSite: 'demo' };

describe('sharedOnlineOf', () => {
    it('names the other projects on the same repository and site, whatever the case', async () => {
        const state = stateWith(storefront('a', '/a', 'acme/demo'), storefront('b', '/b', 'Acme/Demo'), storefront('c', '/c', 'acme/other'));

        await expect(sharedOnlineOf(state, ACME, ['/a'])).resolves.toStrictEqual({ repo: ['b'], site: ['b'] });
    });

    it('tells the repository from the site: one shared, the other not', async () => {
        const state = stateWith(storefront('a', '/a', 'acme/demo'), storefront('b', '/b', 'acme/demo', 'b-site'));

        await expect(sharedOnlineOf(state, ACME, ['/a'])).resolves.toStrictEqual({ repo: ['b'], site: [] });
    });

    it('counts none of the projects going together, and nothing for a project with no storefront', async () => {
        const state = stateWith(storefront('a', '/a', 'acme/demo'), storefront('b', '/b', 'acme/demo'));

        await expect(sharedOnlineOf(state, ACME, ['/a', '/b'])).resolves.toStrictEqual({ repo: [], site: [] });
        await expect(sharedOnlineOf(state, null, ['/a'])).resolves.toStrictEqual({ repo: [], site: [] });
    });
});
