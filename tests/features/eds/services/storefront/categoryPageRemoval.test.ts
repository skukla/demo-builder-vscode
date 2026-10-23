/**
 * removeCategoryPages — taking the overlay's category pages off Helix (EDS-61).
 *
 * Category pages live at each category's own address (`/signs`), so there is no folder to
 * list: the catalog menu step hands over the exact paths — ones it published for
 * categories the store no longer has, with every authored page already left out. The
 * rules shared with product pages stay: a shared repository is refused, a removal that
 * fails is said, never a clean zero.
 */

import {
    removeCategoryPages,
    type CategoryPageRemovalDeps,
} from '@/features/eds/services/storefront/productPageRemoval';
import { createMockLogger } from '../../../../helpers/loggerFake';

const TARGET = { repoOwner: 'skukla', repoName: 'kukla-justrite' };

function setUp(overrides: Partial<CategoryPageRemovalDeps> = {}) {
    const unpublishPages = jest.fn(async (_o: string, _r: string, _b: string, paths: string[]) => ({
        total: paths.length,
        liveFailed: 0,
        previewFailed: 0,
    }));
    const deps: CategoryPageRemovalDeps = {
        helix: { listPublishedPaths: jest.fn(), unpublishPages },
        otherProjectsOnRepo: jest.fn().mockResolvedValue([]),
        logger: createMockLogger(),
        ...overrides,
    };
    return { deps, unpublishPages };
}

describe('removeCategoryPages', () => {
    it('takes exactly the paths it is handed off the site Helix keys by GitHub owner and repo', async () => {
        const { deps, unpublishPages } = setUp();

        const result = await removeCategoryPages(TARGET, deps, ['/gloves', '/gloves/winter']);

        expect(unpublishPages).toHaveBeenCalledWith('skukla', 'kukla-justrite', 'main', ['/gloves', '/gloves/winter']);
        expect(deps.helix.listPublishedPaths).not.toHaveBeenCalled();
        expect(result.summary).toBe('Removed 2 category pages from skukla/kukla-justrite, live and preview.');
    });

    it('never hands over the template', async () => {
        const { deps, unpublishPages } = setUp();

        await removeCategoryPages(TARGET, deps, ['/categories/default', '/gloves']);

        expect(unpublishPages.mock.calls[0][3]).toEqual(['/gloves']);
    });

    it('calls nothing when there is nothing to remove', async () => {
        const { deps, unpublishPages } = setUp();

        const result = await removeCategoryPages(TARGET, deps, []);

        expect(unpublishPages).not.toHaveBeenCalled();
        expect(result.status).toBe('nothing');
    });

    it('refuses, naming the project, when another project publishes to the same repository', async () => {
        const { deps, unpublishPages } = setUp({ otherProjectsOnRepo: jest.fn().mockResolvedValue(['Acme']) });

        const result = await removeCategoryPages(TARGET, deps, ['/gloves']);

        expect(unpublishPages).not.toHaveBeenCalled();
        expect(result.status).toBe('refused');
        expect(result.summary).toBe(
            'Category pages were left published: the project "Acme" also publishes to skukla/kukla-justrite, ' +
                'and removing them would take its category pages down too.',
        );
    });

    it('says the pages may still be live when the removal fails', async () => {
        const { deps } = setUp({
            helix: { listPublishedPaths: jest.fn(), unpublishPages: jest.fn().mockRejectedValue(new Error('HTTP 401')) },
        });

        const result = await removeCategoryPages(TARGET, deps, ['/gloves']);

        expect(result.status).toBe('failed');
        expect(result.summary).toContain('They may still be live.');
    });
});
