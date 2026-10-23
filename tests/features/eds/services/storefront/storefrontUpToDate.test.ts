/**
 * The one step that leaves a storefront current: creation, reset and a tested-boilerplate
 * update run it.
 *
 * GitHub is a map of files; the smart 404 installer (its own suite's) and the retired-patch
 * ledger (a network read) are the fakes. Asserted: what is read, what is written, against which
 * sha, in how many writes.
 */

import {
    bringStorefrontUpToDate,
    planStorefrontRepairs,
    STOREFRONT_REPAIR_COMMIT,
} from '@/features/eds/services/storefront/storefrontUpToDate';
import { alignNotFoundImportMap } from '@/features/eds/services/storefront/notFoundPage';
import { createMockGithub, type GithubFake } from '../../../../helpers/githubFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { HEAD, importsOf, NOT_FOUND } from '../../../../helpers/notFoundPageFixtures';
import {
    COMMERCE_JS_CANONICAL,
    COMMERCE_JS_RETIRED_APPLIED,
    RETIRED_PATCHES,
} from '../../../../helpers/retiredPatchFixtures';
import { HEADER_JS, HEADER_NAV_TOOLS, KNOWN_PATCHES, TEASER_JS } from '../../../../helpers/knownPatchFixtures';

const mockInstall404 = jest.fn();
jest.mock('@/features/eds/services/pdp/pdp404HandlerPublisher', () => ({
    ...jest.requireActual('@/features/eds/services/pdp/pdp404HandlerPublisher'),
    installSmart404Handler: (...a: unknown[]) => mockInstall404(...a),
}));
const mockReadShipped = jest.fn();
jest.mock('@/features/eds/services/patches/shippedPatchLedger', () => ({
    readShippedPatches: (...a: unknown[]) => mockReadShipped(...a),
}));

const COMMERCE = 'scripts/commerce.js';
const TARGET = { owner: 'me', repo: 'store' };

function github(files: Record<string, string | undefined>): GithubFake {
    return createMockGithub({
        getFileContent: jest.fn(async (_o: string, _r: string, path: string) =>
            files[path] === undefined ? null : { content: files[path]!, sha: `${path}-sha`, path },
        ),
    });
}

/** Each write as [path, content, message, sha]. */
function writes(gh: GithubFake): Array<[string, string, string, string]> {
    return gh.createOrUpdateFile.mock.calls.map((c) => {
        const [, , path, content, message, sha] = c as string[];
        return [path, content, message, sha];
    });
}

const OLD = { 'head.html': HEAD, '404.html': NOT_FOUND, [COMMERCE]: COMMERCE_JS_RETIRED_APPLIED };

beforeEach(() => {
    mockInstall404.mockReset().mockResolvedValue({ installed: false, reason: 'BYOM disabled' });
    mockReadShipped.mockReset().mockResolvedValue({ live: [], retired: RETIRED_PATCHES, complete: true });
});

describe('planStorefrontRepairs', () => {
    it('works out each write, with the sha each file was read at, reading each file once', async () => {
        const gh = github(OLD);

        const plan = await planStorefrontRepairs(gh, TARGET, { retired: RETIRED_PATCHES, known: [], logger: createMockLogger() });

        expect(plan.changed.get('404.html')).toBe(alignNotFoundImportMap(HEAD, NOT_FOUND));
        expect(plan.changed.get(COMMERCE)).toBe(COMMERCE_JS_CANONICAL);
        expect(plan.shas.get('404.html')).toBe('404.html-sha');
        expect(plan.done.map((r) => r.id)).toStrictEqual(['not-found-import-map', 'retired-patches']);
        const paths = gh.getFileContent.mock.calls.map((c) => c[2] as string);
        expect(new Set(paths).size).toBe(paths.length);
        expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('puts the eager redirect in the same 404.html content as the alignment', async () => {
        const plan = await planStorefrontRepairs(github(OLD), TARGET, {
            retired: [],
            known: [],
            eagerRedirect: true,
            logger: createMockLogger(),
        });

        const page = plan.changed.get('404.html')!;
        expect(page).toContain('Smart 404 PDP eager redirect');
        expect(importsOf(page)).toEqual(importsOf(HEAD));
    });

    it('plans nothing for a current storefront with no 404.html', async () => {
        const plan = await planStorefrontRepairs(github({ [COMMERCE]: COMMERCE_JS_CANONICAL }), TARGET, {
            retired: RETIRED_PATCHES,
            known: [],
            eagerRedirect: true,
            logger: createMockLogger(),
        });

        expect(plan.changed.size).toBe(0);
    });
});

describe('bringStorefrontUpToDate', () => {
    it('writes each repaired file once, against the sha it read, and answers that it is current', async () => {
        const gh = github(OLD);

        const result = await bringStorefrontUpToDate(gh, 'me', 'store', undefined, createMockLogger(), 'org', 'site');

        expect(writes(gh)).toStrictEqual([
            ['404.html', alignNotFoundImportMap(HEAD, NOT_FOUND), STOREFRONT_REPAIR_COMMIT, '404.html-sha'],
            [COMMERCE, COMMERCE_JS_CANONICAL, STOREFRONT_REPAIR_COMMIT, `${COMMERCE}-sha`],
        ]);
        expect(result.smart404).toStrictEqual({ installed: false, reason: 'BYOM disabled' });
        expect(result.current).toBe(true);
    });

    it('adds the eager redirect once the smart 404 handler is installed', async () => {
        mockInstall404.mockResolvedValue({ installed: true });
        const gh = github({ '404.html': alignNotFoundImportMap(HEAD, NOT_FOUND)!, 'head.html': HEAD });

        await bringStorefrontUpToDate(gh, 'me', 'store', 'https://overlay', createMockLogger(), 'org', 'site');

        expect(writes(gh)).toHaveLength(1);
        expect(writes(gh)[0][1]).toContain('Smart 404 PDP eager redirect');
    });

    it('writes nothing when the storefront is already current', async () => {
        const gh = github({ 'head.html': HEAD, '404.html': alignNotFoundImportMap(HEAD, NOT_FOUND)!, [COMMERCE]: COMMERCE_JS_CANONICAL });

        expect((await bringStorefrontUpToDate(gh, 'me', 'store', undefined, createMockLogger(), 'o', 's')).current).toBe(true);
        expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it("puts our live patches into a colleague's storefront wherever its code fits them", async () => {
        mockReadShipped.mockResolvedValue({ live: KNOWN_PATCHES, retired: [], complete: true });
        const gh = github({ [HEADER_NAV_TOOLS.target]: HEADER_JS, 'blocks/product-teaser/product-teaser.js': TEASER_JS });

        const result = await bringStorefrontUpToDate(gh, 'kmanns', 'justrite', undefined, createMockLogger(), 'o', 's');

        expect(writes(gh).map(([path, content, message, sha]) => [path, content.includes('rootLink'), message, sha])).toStrictEqual([
            [HEADER_NAV_TOOLS.target, false, STOREFRONT_REPAIR_COMMIT, `${HEADER_NAV_TOOLS.target}-sha`],
            ['blocks/product-teaser/product-teaser.js', false, STOREFRONT_REPAIR_COMMIT, 'blocks/product-teaser/product-teaser.js-sha'],
        ]);
        expect(writes(gh)[0][1]).toContain('if (!navTools) {');
        expect(result.current).toBe(true);
    });

    it('writes nothing for live patches a storefront already has', async () => {
        mockReadShipped.mockResolvedValue({ live: [HEADER_NAV_TOOLS], retired: [], complete: true });
        const fixed = HEADER_JS.replace(HEADER_NAV_TOOLS.precondition, HEADER_NAV_TOOLS.replacement);
        const gh = github({ [HEADER_NAV_TOOLS.target]: fixed });

        await bringStorefrontUpToDate(gh, 'me', 'store', undefined, createMockLogger(), 'o', 's');

        expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('applies what it read but is not current when a patch ledger could not be read', async () => {
        mockReadShipped.mockResolvedValue({ live: [HEADER_NAV_TOOLS], retired: [], complete: false });
        const gh = github({ [HEADER_NAV_TOOLS.target]: HEADER_JS });

        const result = await bringStorefrontUpToDate(gh, 'me', 'store', undefined, createMockLogger(), 'o', 's');

        expect(writes(gh).map(([path]) => path)).toStrictEqual([HEADER_NAV_TOOLS.target]);
        expect(result.current).toBe(false);
    });

    it('is not current when a ledger could not be read, even with nothing to write', async () => {
        mockReadShipped.mockResolvedValue({ live: [], retired: [], complete: false });
        const gh = github({ 'head.html': HEAD, '404.html': alignNotFoundImportMap(HEAD, NOT_FOUND)!, [COMMERCE]: COMMERCE_JS_CANONICAL });

        const result = await bringStorefrontUpToDate(gh, 'me', 'store', undefined, createMockLogger(), 'o', 's');

        expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
        expect(result.current).toBe(false);
    });

    it('never throws when GitHub refuses a write, and then answers that it is not current', async () => {
        const gh = github(OLD);
        gh.createOrUpdateFile.mockRejectedValue(new Error('409 conflict'));
        const logger = createMockLogger();

        const result = await bringStorefrontUpToDate(gh, 'me', 'store', undefined, logger, 'o', 's');

        expect(result.current).toBe(false);
        expect(logger.warn).toHaveBeenCalled();
    });

    it('never throws when the storefront cannot be read', async () => {
        const gh = createMockGithub({ getFileContent: jest.fn().mockRejectedValue(new Error('rate limited')) });
        const logger = createMockLogger();

        await expect(bringStorefrontUpToDate(gh, 'me', 'store', undefined, logger, 'o', 's')).resolves.toMatchObject({ current: false });
        expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });
});
