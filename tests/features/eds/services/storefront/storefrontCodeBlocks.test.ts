/**
 * Demo Builder's blocks in a storefront's `head.html`, and the old copies taken out of
 * `scripts/delayed.js` (2026-10-29).
 *
 * Adobe's B2B template removed `scripts/delayed.js` on 2026-07-30, and its delayed loading
 * now waits for cookie consent (declined by default). Two things lived in `delayed.js`: the
 * smart-404 recovery script (now in `404.html`, `pdp404Page.ts`) and the Demo Inspector
 * loader, which now sits in `head.html` beside the eager 404 script. Both `head.html` blocks
 * go in ONE write; the old `delayed.js` copies come out in one write, and only once their
 * replacements are in place, so neither ever starts twice.
 *
 * GitHub is a map of files. Asserted: what is written, to which file, against which sha.
 */

import { SMART_404_HEAD_MARKER_START, buildSmart404Snippet } from '@/features/eds/services/pdp/pdp404Snippet';
import {
    INSPECTOR_DELAYED_SNIPPET,
    INSPECTOR_LOADER_MARKER_START,
    INSPECTOR_LOADER_TEMPLATE,
} from '@/features/eds/services/inspectorLoader';
import { cleanDelayedJs, writeHeadBlocks } from '@/features/eds/services/storefront/storefrontCodeBlocks';
import { createMockGithub, type GithubFake } from '../../../../helpers/githubFake';
import { createMockLogger } from '../../../../helpers/loggerFake';

const TARGET = { owner: 'me', repo: 'store' };
const HEAD = '<meta charset="UTF-8">\n<script nonce="aem" src="/scripts/aem.js" type="module"></script>\n';
const DELAYED = '// add delayed functionality here\n';
const OLD_404 = buildSmart404Snippet('https://old.example/prepublish-pdp', 'kmanns', 'justrite');

/** A repository whose files read as `files`, each read in turn from its list when given one. */
function github(files: Record<string, string | Array<string | null> | null>): GithubFake {
    const reads: Record<string, number> = {};
    return createMockGithub({
        getFileContent: jest.fn(async (_o: string, _r: string, path: string) => {
            const entry = files[path];
            if (entry === undefined || entry === null) return null;
            const n = reads[path] ?? 0;
            reads[path] = n + 1;
            const content = Array.isArray(entry) ? entry[Math.min(n, entry.length - 1)] : entry;
            return content === null ? null : { content, sha: `${path}-sha-${n}`, path, encoding: 'utf-8' };
        }),
        createOrUpdateFile: jest.fn().mockResolvedValue({}),
    });
}

const writesTo = (gh: GithubFake, path: string) => gh.createOrUpdateFile.mock.calls.filter((c) => c[2] === path);

describe('writeHeadBlocks', () => {
    it('puts the eager 404 script and the inspector loader into head.html in one write', async () => {
        const gh = github({ 'head.html': HEAD });

        const result = await writeHeadBlocks(gh, TARGET, { eager: true, inspector: true }, createMockLogger());

        expect(result).toEqual({ eager: true, inspector: true, written: true });
        expect(writesTo(gh, 'head.html')).toHaveLength(1);
        const [, , , content, , sha] = writesTo(gh, 'head.html')[0] as string[];
        expect(content.startsWith(HEAD)).toBe(true);
        expect(content).toContain(SMART_404_HEAD_MARKER_START);
        expect(content).toContain(INSPECTOR_LOADER_MARKER_START);
        expect(content).toContain('<script nonce="aem" type="module">');
        expect(sha).toBe('head.html-sha-0');
    });

    it("takes the CSP nonce from the page's own scripts, never a fixed one", async () => {
        // A rotated nonce (rebrand, security audit) must not silently block both scripts.
        const gh = github({ 'head.html': '<script nonce="future-rotated" type="importmap">{}</script>\n' });

        await writeHeadBlocks(gh, TARGET, { eager: true, inspector: true }, createMockLogger());

        const content = writesTo(gh, 'head.html')[0][3] as string;
        expect(content.match(/nonce="future-rotated"/g)).toHaveLength(3);
        expect(content).not.toContain('nonce="aem"');
    });

    it('adds only what the storefront has: no inspector loader where inspector tagging is not installed', async () => {
        const gh = github({ 'head.html': HEAD });

        await writeHeadBlocks(gh, TARGET, { eager: true, inspector: false }, createMockLogger());

        expect(writesTo(gh, 'head.html')[0][3]).not.toContain(INSPECTOR_LOADER_MARKER_START);
    });

    it('writes nothing when both blocks are current, and still says they are there', async () => {
        const first = github({ 'head.html': HEAD });
        await writeHeadBlocks(first, TARGET, { eager: true, inspector: true }, createMockLogger());
        const gh = github({ 'head.html': writesTo(first, 'head.html')[0][3] as string });

        const result = await writeHeadBlocks(gh, TARGET, { eager: true, inspector: true }, createMockLogger());

        expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
        expect(result).toEqual({ eager: true, inspector: true, written: true });
    });

    it('swaps an older loader in place', async () => {
        const old = `${HEAD}\n${INSPECTOR_LOADER_MARKER_START}\n<script nonce="aem" type="module">/* old */</script>\n<!-- === end Demo Inspector loader === -->\n`;
        const gh = github({ 'head.html': old });

        await writeHeadBlocks(gh, TARGET, { eager: false, inspector: true }, createMockLogger());

        const content = writesTo(gh, 'head.html')[0][3] as string;
        expect(content).not.toContain('/* old */');
        expect(content.split(INSPECTOR_LOADER_MARKER_START)).toHaveLength(2);
    });

    it('reports neither block when head.html is missing or has no nonce to run a script with', async () => {
        for (const head of [null, '<meta charset="UTF-8">']) {
            const gh = github({ 'head.html': head });
            const result = await writeHeadBlocks(gh, TARGET, { eager: true, inspector: true }, createMockLogger());
            expect(result).toEqual({ eager: false, inspector: false, written: true });
            expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
        }
    });

    it('reports neither block, and the write as not done, when GitHub refuses it', async () => {
        const gh = github({ 'head.html': HEAD });
        gh.createOrUpdateFile.mockRejectedValue(new Error('409 conflict'));

        const result = await writeHeadBlocks(gh, TARGET, { eager: true, inspector: true }, createMockLogger());

        expect(result).toEqual({ eager: false, inspector: false, written: false });
    });

    it('does nothing when asked for nothing', async () => {
        const gh = github({ 'head.html': HEAD });

        expect(await writeHeadBlocks(gh, TARGET, { eager: false, inspector: false }, createMockLogger()))
            .toEqual({ eager: false, inspector: false, written: true });
        expect(gh.getFileContent).not.toHaveBeenCalled();
    });
});

describe('cleanDelayedJs', () => {
    const JUSTRITE = DELAYED + INSPECTOR_DELAYED_SNIPPET + OLD_404;

    it('takes both old copies out in one write, leaving the rest of the file as it was', async () => {
        const gh = github({ 'scripts/delayed.js': JUSTRITE });

        expect(await cleanDelayedJs(gh, TARGET, { smart404: true, inspector: true }, createMockLogger())).toBe(true);

        expect(writesTo(gh, 'scripts/delayed.js')).toHaveLength(1);
        expect(writesTo(gh, 'scripts/delayed.js')[0][3]).toBe(DELAYED);
        expect(writesTo(gh, 'scripts/delayed.js')[0][5]).toBe('scripts/delayed.js-sha-0');
    });

    it('takes out only what has a replacement in place', async () => {
        const gh = github({ 'scripts/delayed.js': JUSTRITE });

        await cleanDelayedJs(gh, TARGET, { smart404: false, inspector: true }, createMockLogger());

        expect(writesTo(gh, 'scripts/delayed.js')[0][3]).toBe(DELAYED + OLD_404);
    });

    it('leaves an inspector snippet that was edited by hand, and reads as done', async () => {
        const edited = DELAYED + INSPECTOR_DELAYED_SNIPPET.replace('initInspector();', 'initInspector(); // mine');
        const gh = github({ 'scripts/delayed.js': edited });

        expect(await cleanDelayedJs(gh, TARGET, { smart404: true, inspector: true }, createMockLogger())).toBe(true);
        expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('does nothing where there is no delayed.js (the B2B template) or nothing of ours in it', async () => {
        for (const file of [null, DELAYED]) {
            const gh = github({ 'scripts/delayed.js': file });
            expect(await cleanDelayedJs(gh, TARGET, { smart404: true, inspector: true }, createMockLogger())).toBe(true);
            expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
        }
    });

    it('does not even read delayed.js when nothing has a replacement in place', async () => {
        const gh = github({ 'scripts/delayed.js': JUSTRITE });

        expect(await cleanDelayedJs(gh, TARGET, { smart404: false, inspector: false }, createMockLogger())).toBe(true);
        expect(gh.getFileContent).not.toHaveBeenCalled();
    });

    it('answers false, never throws, when the write is refused or the file cannot be read', async () => {
        const refused = github({ 'scripts/delayed.js': JUSTRITE });
        refused.createOrUpdateFile.mockRejectedValue(new Error('Resource not accessible by integration'));
        expect(await cleanDelayedJs(refused, TARGET, { smart404: true, inspector: true }, createMockLogger())).toBe(false);
        expect(writesTo(refused, 'scripts/delayed.js')).toHaveLength(1);

        const unreadable = createMockGithub({ getFileContent: jest.fn().mockRejectedValue(new Error('rate limited')) });
        expect(await cleanDelayedJs(unreadable, TARGET, { smart404: true, inspector: true }, createMockLogger())).toBe(false);
    });

    /**
     * Kept from the delayed.js install this replaced: a reset's tree commit has just rewritten
     * the file, and the Contents API can serve it from before that commit (a live run lost
     * that race 18 seconds after a tree commit, 2026-08). Re-read and retry exactly once.
     */
    it('re-reads and retries once on a stale SHA, from the file it just read', async () => {
        const fresh = `${DELAYED}import './later.js';\n${INSPECTOR_DELAYED_SNIPPET}${OLD_404}`;
        const gh = github({ 'scripts/delayed.js': [JUSTRITE, fresh] });
        gh.createOrUpdateFile
            .mockRejectedValueOnce(new Error('scripts/delayed.js does not match 15be5fb9e97773471ea4124c259d6d1e2eeb2626'))
            .mockResolvedValue({});

        expect(await cleanDelayedJs(gh, TARGET, { smart404: true, inspector: true }, createMockLogger())).toBe(true);

        expect(writesTo(gh, 'scripts/delayed.js')).toHaveLength(2);
        expect(writesTo(gh, 'scripts/delayed.js')[1][3]).toBe(`${DELAYED}import './later.js';\n`);
        expect(writesTo(gh, 'scripts/delayed.js')[1][5]).toBe('scripts/delayed.js-sha-1');
    });

    it('retries only once: a second stale rejection answers false', async () => {
        const gh = github({ 'scripts/delayed.js': [JUSTRITE, JUSTRITE] });
        gh.createOrUpdateFile.mockRejectedValue(new Error('scripts/delayed.js does not match abc'));

        expect(await cleanDelayedJs(gh, TARGET, { smart404: true, inspector: true }, createMockLogger())).toBe(false);
        expect(writesTo(gh, 'scripts/delayed.js')).toHaveLength(2);
    });
});

/**
 * The loader, run. It waits until late in the page load, when `delayed.js` used to run:
 * Adobe's old `loadDelayed()` imported it 3 s after `loadLazy()` (every section loaded),
 * read from boilerplate-b2b-template@48bed04. The import itself cannot run in this harness
 * (no module loader), and the script swallows that just as it swallows a missing file.
 */
describe('the inspector loader in head.html', () => {
    function runLoader(readyState: string, sectionStates: string[][]) {
        let polls = 0;
        const timers: Array<{ ms: number; fn: () => void }> = [];
        const listeners: Array<() => void> = [];
        const code = INSPECTOR_LOADER_TEMPLATE.replace(/^[\s\S]*?<script[^>]*>/, '').replace(/<\/script>[\s\S]*$/, '');
        const document = {
            readyState,
            querySelector: () => {
                const states = sectionStates[Math.min(polls, sectionStates.length - 1)];
                polls += 1;
                return states.some((s) => s !== 'loaded') ? {} : null;
            },
        };
        const window = { hlx: { codeBasePath: '' }, addEventListener: (_e: string, fn: () => void) => listeners.push(fn) };
        const setTimeout = (fn: () => void, ms: number) => timers.push({ fn, ms });
        new Function('window', 'document', 'setTimeout', code)(window, document, setTimeout);
        return { timers, listeners };
    }

    it('waits for the page to load, then for every section, then 3 seconds', () => {
        const { timers, listeners } = runLoader('interactive', [['loading', 'loaded'], ['loaded', 'loaded']]);
        expect(timers).toHaveLength(0);

        listeners[0]();
        expect(timers.map((t) => t.ms)).toEqual([250]);
        timers[0].fn();
        expect(timers.map((t) => t.ms)).toEqual([250, 3000]);
    });

    it('starts at once on a page that has already loaded', () => {
        const { timers, listeners } = runLoader('complete', [['loaded']]);

        expect(listeners).toHaveLength(0);
        expect(timers.map((t) => t.ms)).toEqual([3000]);
    });

    it('swallows an inspector that is not there', async () => {
        const { timers } = runLoader('complete', [['loaded']]);

        await expect((async () => timers[0].fn())()).resolves.toBeUndefined();
    });

    it('reads the init script under the storefront code base path', () => {
        expect(INSPECTOR_LOADER_TEMPLATE).toContain('window.hlx.codeBasePath');
        expect(INSPECTOR_LOADER_TEMPLATE).toContain('/scripts/demo-inspector-init.js');
    });
});
