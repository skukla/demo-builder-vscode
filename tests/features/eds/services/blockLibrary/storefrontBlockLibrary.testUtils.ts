/**
 * The shared harness for the `buildStorefrontBlockLibrary` suites: a storefront tree, Adobe's
 * captured sheets (tests/fixtures/eds/block-library), an installed Isle5 library, and doubles for
 * the DA.live block-library ops whose ARGUMENTS the suites assert.
 *
 * Not a `*.test.ts` file, so Jest does not run it directly.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { installSiteFetch } from '../../../../helpers/siteFetchFake';
import type { StorefrontBlockLibraryParams } from '@/features/eds/services/blockLibrary/storefrontBlockLibrary';
import type { StorefrontBlock } from '@/features/eds/services/blockLibrary/storefrontBlockList';
import type { StorefrontLibraryInput } from '@/features/eds/services/blockLibrary/storefrontLibraryWriter';
import type { GitHubFileContent, GitHubTreeEntry } from '@/features/eds/services/types';

const FIXTURES = resolve(__dirname, '../../../../fixtures/eds/block-library');
const fixture = (name: string): string => readFileSync(resolve(FIXTURES, name), 'utf8');

export const B2B_SITE = { org: 'adobe-commerce', site: 'boilerplate-b2b' };
export const ISLE5_SITE = { org: 'stephen-garner-adobe', site: 'isle5' };
export const B2B = 'https://main--boilerplate-b2b--adobe-commerce.aem.page';
const B2B_LIVE = 'https://main--boilerplate-b2b--adobe-commerce.aem.live';
export const BRAND = 'https://main--brand-content--brand.aem.page';
const BRAND_LIVE = 'https://main--brand-content--brand.aem.live';
const ISLE5 = 'https://main--isle5--stephen-garner-adobe.aem.page';
export const ISLE5_LIVE = 'https://main--isle5--stephen-garner-adobe.aem.live';

const tree = (...paths: string[]): GitHubTreeEntry[] =>
    paths.map((path) => ({ path, type: 'blob', sha: `sha-${path}` }));
export const STOREFRONT_TREE = tree(
    'blocks/hero/hero.js', 'blocks/cards/cards.js', 'blocks/tabs/tabs.js', 'blocks/tabs/tabs.css',
    'blocks/carousel/carousel.js', 'blocks/commerce-cart/commerce-cart.js',
    'blocks/widget/widget.js', 'blocks/README.md', 'scripts/scripts.js',
);
/** A block whose code reads a third column (`jsShape`: 1 row, 3 columns). */
export const WIDGET_JS: GitHubFileContent = {
    path: 'blocks/widget/widget.js', content: 'row.children[2]', sha: 's', encoding: 'utf-8',
};
const ISLE5_TREE = tree('blocks/tabs/tabs.js', 'blocks/carousel/carousel.js', 'blocks/gallery/g.js');

export const SERVED: Record<string, unknown> = {
    [`${B2B}/docs/library/blocks.json`]: JSON.parse(fixture('b2b-blocks.json')),
    [`${B2B}/docs/library/templates.json`]: JSON.parse(fixture('b2b-templates.json')),
    [`${ISLE5}/.da/library/blocks/tabs.plain.html`]: '<div><div class="tabs"></div></div>',
    [`${ISLE5_LIVE}/full-index.json`]: { data: [{ path: '/home' }] },
    [`${ISLE5}/home.plain.html`]: '<div><div class="carousel"><div><div>Slide</div></div></div></div>',
    [`${BRAND_LIVE}/full-index.json`]: { data: [{ path: '/about' }] },
    [`${BRAND}/about.plain.html`]: '<div><p>About us</p></div>',
    [`${B2B_LIVE}/full-index.json`]: { data: [{ path: '/cart' }] },
    [`${B2B}/cart.plain.html`]: fixture('b2b-cart.plain.html'),
};

export const PARAMS: StorefrontBlockLibraryParams = {
    daLiveOrg: 'user-org',
    daLiveSite: 'user-site',
    repo: { owner: 'sc', repo: 'store' },
    contentSource: { org: 'brand', site: 'brand-content', indexPath: '/full-index.json' },
    accountContentSource: B2B_SITE,
    blockLibraries: ['isle5', 'demo-builder-blocks'],
};

/** A page someone wrote: not the old stub's shape. */
export const SC_PAGE = '<body><header></header><main><div><div class="cards"><div><div><p>Our picks</p>'
    + '<p>Edited</p></div></div></div></div></main><footer></footer></body>';

/**
 * The page the old stub generator wrote (`generateStubDocPages`, removed with
 * component-definition.json), with line breaks between tags as DA.live may keep them.
 */
export const oldStub = (id: string, cell: string): string => '<body>\n  <header></header>\n  <main>'
    + `<div><div class="${id}">\n<div><div>${cell}</div></div></div></div></main>`
    + '<footer></footer>\n</body>';

export const WRITTEN = { success: true, blocksCount: 11, paths: ['/.da/library/blocks.json'] };

/** The build's deps over the site fake, and readers for what the writer was handed. */
export function harness(served: Record<string, unknown> = SERVED, unreachable: string[] = []) {
    const site = installSiteFetch(served, unreachable);
    const listRepoFiles = jest.fn(async (owner: string) =>
        (owner === 'sc' ? STOREFRONT_TREE : ISLE5_TREE));
    const getFileContent = jest.fn(async (_o: string, _r: string, path: string) =>
        (path === 'blocks/widget/widget.js' ? WIDGET_JS : null));
    const blockLibOps = {
        getBlocksWithDocs: jest.fn().mockResolvedValue(['cards']),
        readBlockDocPage: jest.fn().mockResolvedValue(SC_PAGE),
        readBlocksSheetRows: jest.fn().mockResolvedValue(null),
        writeStorefrontBlockLibrary: jest.fn().mockResolvedValue(WRITTEN),
    };
    const logger = createMockLogger();
    const deps = {
        blockLibOps,
        files: { listRepoFiles, getFileContent },
        fetchImpl: site.fetchMock as unknown as typeof fetch,
        logger,
    };
    const written = (): StorefrontLibraryInput => blockLibOps.writeStorefrontBlockLibrary.mock.calls[0][2];
    const exampleOf = (id: string): StorefrontBlock['example'] | undefined =>
        written().blocks.find((block) => block.id === id)?.example;
    return { site, deps, blockLibOps, listRepoFiles, getFileContent, written, exampleOf };
}
