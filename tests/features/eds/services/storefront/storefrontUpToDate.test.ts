/**
 * The one step that leaves a storefront current: creation, reset and a tested-boilerplate
 * update run it.
 *
 * GitHub is a map of files; the retired-patch ledger (a network read) is the one fake. The
 * smart 404 script, where it goes in 404.html (`pdp404Page.ts`), head.html's blocks and the
 * delayed.js cleanup (`storefrontCodeBlocks.ts`) are real. Asserted: what is read, what is
 * written, in which order, against which sha.
 */

import {
    bringStorefrontUpToDate,
    planStorefrontRepairs,
    STOREFRONT_REPAIR_COMMIT,
} from '@/features/eds/services/storefront/storefrontUpToDate';
import { alignNotFoundImportMap } from '@/features/eds/services/storefront/notFoundPage';
import { SMART_404_PAGE_MARKER_START } from '@/features/eds/services/pdp/pdp404Page';
import { buildSmart404Snippet, SMART_404_HEAD_MARKER_START } from '@/features/eds/services/pdp/pdp404Snippet';
import { INSPECTOR_DELAYED_SNIPPET, INSPECTOR_LOADER_MARKER_START } from '@/features/eds/services/inspectorLoader';
import { createMockGithub, type GithubFake } from '../../../../helpers/githubFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { HEAD, importsOf, NOT_FOUND } from '../../../../helpers/notFoundPageFixtures';
import {
    COMMERCE_JS_CANONICAL,
    COMMERCE_JS_RETIRED_APPLIED,
    RETIRED_PATCHES,
} from '../../../../helpers/retiredPatchFixtures';
import { HEADER_JS, HEADER_NAV_TOOLS, KNOWN_PATCHES, TEASER_JS } from '../../../../helpers/knownPatchFixtures';

const mockReadShipped = jest.fn();
jest.mock('@/features/eds/services/patches/shippedPatchLedger', () => ({
    readShippedPatches: (...a: unknown[]) => mockReadShipped(...a),
}));

const COMMERCE = 'scripts/commerce.js';
const OVERLAY = 'https://x.test/api/v1/web/accs-discovery/render-pdp';
const HANDLER = buildSmart404Snippet('https://x.test/api/v1/web/accs-discovery/prepublish-pdp', 'org', 'site');
const DELAYED = '// add delayed functionality here\n';
const OLD_404 = buildSmart404Snippet('https://old.test/prepublish-pdp', 'kmanns', 'justrite');
/** JustRite's delayed.js on 2026-10-29: both old copies. */
const OLD_DELAYED = DELAYED + INSPECTOR_DELAYED_SNIPPET + OLD_404;
const INIT = 'scripts/demo-inspector-init.js';
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

    it('puts the eager script and the recovery script in the same 404.html content as the alignment', async () => {
        const plan = await planStorefrontRepairs(github(OLD), TARGET, {
            retired: [],
            known: [],
            smart404Handler: HANDLER,
            logger: createMockLogger(),
        });

        const page = plan.changed.get('404.html')!;
        expect(page).toContain(SMART_404_HEAD_MARKER_START);
        expect(page).toContain(SMART_404_PAGE_MARKER_START);
        expect(page).toContain(HANDLER.trim());
        expect(importsOf(page)).toEqual(importsOf(HEAD));
        expect(plan.smart404?.kind).toBe('changed');
    });

    it('plans nothing for a current storefront with no 404.html, and says the script has nowhere to go', async () => {
        const plan = await planStorefrontRepairs(github({ [COMMERCE]: COMMERCE_JS_CANONICAL }), TARGET, {
            retired: RETIRED_PATCHES,
            known: [],
            smart404Handler: HANDLER,
            logger: createMockLogger(),
        });

        expect(plan.changed.size).toBe(0);
        expect(plan.smart404).toEqual({ kind: 'skipped', reason: '404.html missing' });
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

    it('puts every script in place, one write per file, and only then takes the old delayed.js copies out', async () => {
        const gh = github({ 'head.html': HEAD, '404.html': alignNotFoundImportMap(HEAD, NOT_FOUND)!, 'scripts/delayed.js': OLD_DELAYED, [INIT]: 'x' });

        const result = await bringStorefrontUpToDate(gh, 'me', 'store', OVERLAY, createMockLogger(), 'org', 'site');

        expect(writes(gh).map(([path]) => path)).toEqual(['head.html', '404.html', 'scripts/delayed.js']);
        const [head, page, delayed] = writes(gh);
        expect(head[1]).toContain(SMART_404_HEAD_MARKER_START);
        expect(head[1]).toContain(INSPECTOR_LOADER_MARKER_START);
        expect(page[1]).toContain(SMART_404_HEAD_MARKER_START);
        expect(page[1]).toContain(HANDLER.trim());
        expect(delayed[1]).toBe(DELAYED);
        expect(result).toEqual({ smart404: { installed: true }, current: true });
    });

    it("leaves a B2B storefront's missing delayed.js alone: nothing to take out", async () => {
        const gh = github({ 'head.html': HEAD, '404.html': alignNotFoundImportMap(HEAD, NOT_FOUND)!, [INIT]: 'x' });

        const result = await bringStorefrontUpToDate(gh, 'me', 'store', OVERLAY, createMockLogger(), 'org', 'site');

        expect(writes(gh).map(([path]) => path)).toEqual(['head.html', '404.html']);
        expect(result).toEqual({ smart404: { installed: true }, current: true });
    });

    it('writes nothing to files that already have the current scripts, and still takes the old copies out', async () => {
        const first = github({ 'head.html': HEAD, '404.html': alignNotFoundImportMap(HEAD, NOT_FOUND)!, [INIT]: 'x' });
        await bringStorefrontUpToDate(first, 'me', 'store', OVERLAY, createMockLogger(), 'org', 'site');
        const [head, page] = writes(first);
        const gh = github({ 'head.html': head[1], '404.html': page[1], 'scripts/delayed.js': OLD_DELAYED, [INIT]: 'x' });

        const result = await bringStorefrontUpToDate(gh, 'me', 'store', OVERLAY, createMockLogger(), 'org', 'site');

        expect(writes(gh).map(([path, content]) => [path, content])).toEqual([['scripts/delayed.js', DELAYED]]);
        expect(result).toEqual({ smart404: { installed: true }, current: true });
    });

    it('keeps the old recovery copy, and says why, when the 404.html write is refused', async () => {
        const gh = github({ 'head.html': HEAD, '404.html': NOT_FOUND, 'scripts/delayed.js': OLD_DELAYED, [INIT]: 'x' });
        gh.createOrUpdateFile.mockImplementation(async (_o: string, _r: string, path: string) => {
            if (path === '404.html') throw new Error('409 conflict');
            return {};
        });

        const result = await bringStorefrontUpToDate(gh, 'me', 'store', OVERLAY, createMockLogger(), 'org', 'site');

        expect(result).toEqual({ smart404: { installed: false, reason: '404.html was not written' }, current: false });
        // The Inspector loader did land in head.html, so its old copy goes; the 404 copy stays.
        expect(writes(gh).find(([path]) => path === 'scripts/delayed.js')?.[1]).toBe(DELAYED + OLD_404);
    });

    it('says the script has nowhere to go on a storefront with no 404.html, or none it can run in', async () => {
        const noNonce = '<!DOCTYPE html><html><head></head><body><main></main></body></html>';
        for (const [files, reason] of [
            [{ 'scripts/delayed.js': OLD_DELAYED }, '404.html missing'],
            [{ '404.html': noNonce, 'scripts/delayed.js': OLD_DELAYED }, '404.html has no nonced script tag'],
        ] as const) {
            const gh = github(files);
            const result = await bringStorefrontUpToDate(gh, 'me', 'store', OVERLAY, createMockLogger(), 'o', 's');
            expect(result.smart404).toEqual({ installed: false, reason });
            expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
        }
    });

    it('is not current while an old copy could not be taken out of delayed.js', async () => {
        const gh = github({ 'head.html': HEAD, '404.html': NOT_FOUND, 'scripts/delayed.js': OLD_DELAYED, [INIT]: 'x' });
        gh.createOrUpdateFile.mockImplementation(async (_o: string, _r: string, path: string) => {
            if (path === 'scripts/delayed.js') throw new Error('Resource not accessible by integration');
            return {};
        });

        const result = await bringStorefrontUpToDate(gh, 'me', 'store', OVERLAY, createMockLogger(), 'o', 's');

        expect(result).toEqual({ smart404: { installed: true }, current: false });
    });

    it('loads the Inspector from head.html only where inspector tagging is installed', async () => {
        // No init script, and the caller did not just install it: no loader, and the old
        // delayed.js loader (if any) is left running.
        const bare = github({ 'head.html': HEAD, 'scripts/delayed.js': DELAYED + INSPECTOR_DELAYED_SNIPPET });
        await bringStorefrontUpToDate(bare, 'me', 'store', undefined, createMockLogger(), 'o', 's');
        expect(bare.createOrUpdateFile).not.toHaveBeenCalled();

        // Creation and reset have just installed it, in a commit the Contents API may not
        // serve yet: they say so rather than have the file read.
        const fresh = github({ 'head.html': HEAD, 'scripts/delayed.js': DELAYED + INSPECTOR_DELAYED_SNIPPET });
        await bringStorefrontUpToDate(fresh, 'me', 'store', undefined, createMockLogger(), 'o', 's', { inspectorInstalled: true });
        expect(writes(fresh).map(([path]) => path)).toEqual(['head.html', 'scripts/delayed.js']);
        expect(writes(fresh)[0][1]).toContain(INSPECTOR_LOADER_MARKER_START);
        expect(writes(fresh)[0][1]).not.toContain(SMART_404_HEAD_MARKER_START);
        expect(writes(fresh)[1][1]).toBe(DELAYED);
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
