/**
 * The authored-pages sheet, `/authored-category-pages.json` (EDS-61, owner decision
 * 2026-10-22).
 *
 * Helix asks the overlay first on every preview, so an authored page at a category's
 * address would be replaced by the overlay's (measured on scratch-1022-b, 2026-10-22). The
 * overlay steps aside for the paths this public sheet lists — `{data: [{path: "/signs"}]}`
 * as served. Demo Builder writes it as DA.live's native sheet document, the shape
 * `buildSheetDocument` makes for every sheet the extension writes.
 */

import {
    AUTHORED_SHEET_PATH,
    authoredAddresses,
    authoredSheetSource,
    findAuthoredPaths,
} from '@/features/eds/services/catalogMenu/authoredCategoryPages';
import { hashOf } from '@/features/eds/services/catalogMenu/ownedPages';
import { fakeStorefront } from './catalogMenuService.testUtils';

describe('authoredSheetSource', () => {
    it("is one sheet named data, one path per row: what the overlay reads as `data[].path`", () => {
        const doc = JSON.parse(authoredSheetSource(['/apparel', '/signs/danger-signs']));

        expect(doc[':names']).toEqual(['data']);
        expect(doc.data.data).toEqual([{ path: '/apparel' }, { path: '/signs/danger-signs' }]);
        expect(doc.data.total).toBe(2);
    });

    it('is written even when no page is authored, so the list is current', () => {
        expect(JSON.parse(authoredSheetSource([])).data.data).toStrictEqual([]);
    });

    it('lives at a .json path, published one path at a time like every sheet', () => {
        expect(AUTHORED_SHEET_PATH).toBe('/authored-category-pages.json');
    });
});

describe('findAuthoredPaths', () => {
    it('is the category paths DA.live holds a document for', async () => {
        const site = fakeStorefront({ '/apparel': '<body>ours</body>', '/nav': '<body>nav</body>' });

        const authored = await findAuthoredPaths(site.port, ['/apparel', '/signs', '/nav']);

        expect([...authored].sort()).toEqual(['/apparel', '/nav']);
    });

    it('fails rather than guessing when a page cannot be read', async () => {
        const site = fakeStorefront({});
        const port = {
            ...site.port,
            read: async (): Promise<string | null> => {
                throw new Error('DA.live 401');
            },
        };

        await expect(findAuthoredPaths(port, ['/signs'])).rejects.toThrow('DA.live 401');
    });
});

describe('authoredAddresses', () => {
    it("is every category address with a DA.live document that is not Demo Builder's own unedited page", async () => {
        const ours = '<body>generated</body>';
        const site = fakeStorefront({
            '/apparel': '<body>hand-built</body>',
            '/signs': ours,
            '/tools': '<body>ours, edited</body>',
        });
        const legacy = [
            { path: '/signs', hash: hashOf(ours) },
            { path: '/tools', hash: hashOf('<body>ours</body>') },
        ];

        const authored = await authoredAddresses(site.port, ['/apparel', '/signs', '/tools', '/gloves'], legacy);

        expect([...authored].sort()).toEqual(['/apparel', '/tools']);
    });
});
