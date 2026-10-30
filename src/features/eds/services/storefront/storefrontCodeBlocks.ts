/**
 * Demo Builder's blocks in a storefront's `head.html`, and the old copies it takes out of
 * `scripts/delayed.js` — the one writer of each.
 *
 * `head.html` carries two marked blocks, written together in ONE write so nothing races
 * the file's sha: the eager 404 script (`pdp404Snippet.ts`, BYOM on) and the Demo Inspector
 * loader (`inspectorLoader.ts`, inspector tagging installed). Each is added where missing
 * and swapped in place when it changes (`pdp404Page.ts` places blocks).
 *
 * `scripts/delayed.js` held the smart-404 recovery script and the Inspector loader until
 * 2026-10-29; Adobe's B2B template has no such file since 2026-07-30. A storefront that
 * still carries either copy loses it in one write, and only once its replacement is in
 * place (`404.html`, `head.html`), so neither ever runs twice. The rest of the file is
 * left exactly as it was.
 *
 * `bringStorefrontUpToDate` calls both. Neither throws.
 *
 * @module features/eds/services/storefront/storefrontCodeBlocks
 */

import { isStaleShaFailure, type RepoFileAccess } from '../github/githubFileOperations';
import {
    INSPECTOR_DELAYED_MARKER,
    INSPECTOR_DELAYED_SNIPPET,
    INSPECTOR_LOADER_MARKER_END,
    INSPECTOR_LOADER_MARKER_START,
    INSPECTOR_LOADER_TEMPLATE,
} from '../inspectorLoader';
import { eagerBlock, type PageBlock, withCurrentBlock, withoutDelayedJsHandler } from '../pdp/pdp404Page';
import type { Logger } from '@/types/logger';

type FileOps = RepoFileAccess;

/** The repository a run reads and writes. */
interface Repo {
    owner: string;
    repo: string;
}

/** Which of Demo Builder's blocks a storefront should have, or has. */
export interface HeadBlocks {
    /** The eager 404 script (BYOM on). */
    eager: boolean;
    /** The Demo Inspector loader (inspector tagging installed). */
    inspector: boolean;
}

const DELAYED_JS = 'scripts/delayed.js';
const HEAD_COMMIT = 'chore(demo-builder): bring Demo Builder’s head.html scripts up to date';
const DELAYED_COMMIT = 'chore(demo-builder): move Demo Builder’s scripts out of delayed.js';

/** The Inspector loader's block in `head.html`. */
export const inspectorLoaderBlock: PageBlock = {
    file: 'head.html',
    start: INSPECTOR_LOADER_MARKER_START,
    end: INSPECTOR_LOADER_MARKER_END,
    before: '</head>',
    build: (nonce) => INSPECTOR_LOADER_TEMPLATE.replace(/__NONCE__/g, nonce),
};

/**
 * Make the wanted blocks current in `head.html`, in one write.
 *
 * @returns which blocks are in `head.html` afterwards, and whether the write (if any) landed
 */
export async function writeHeadBlocks(
    fileOps: FileOps,
    target: Repo,
    want: HeadBlocks,
    logger: Logger,
): Promise<HeadBlocks & { written: boolean }> {
    const none = { eager: false, inspector: false };
    if (!want.eager && !want.inspector) return { ...none, written: true };
    const existing = await fileOps.getFileContent(target.owner, target.repo, 'head.html');
    if (!existing?.content) {
        logger.warn('[Storefront Scripts] head.html not found — its Demo Builder scripts were not added');
        return { ...none, written: true };
    }
    let html = existing.content;
    const has = { ...none };
    const wanted: Array<[keyof HeadBlocks, PageBlock]> = [['eager', eagerBlock('head.html')], ['inspector', inspectorLoaderBlock]];
    for (const [name, block] of wanted) {
        if (!want[name]) continue;
        const outcome = withCurrentBlock(html, block);
        if (outcome.kind === 'skipped') {
            logger.warn(`[Storefront Scripts] ${name} script not added to head.html: ${outcome.reason}`);
            continue;
        }
        if (outcome.kind === 'changed') html = outcome.html;
        has[name] = true;
    }
    if (html === existing.content) return { ...has, written: true };
    try {
        await fileOps.createOrUpdateFile(target.owner, target.repo, 'head.html', html, HEAD_COMMIT, existing.sha);
        logger.info(`[Storefront Scripts] Updated head.html (${target.owner}/${target.repo})`);
        return { ...has, written: true };
    } catch (error) {
        logger.warn(`[Storefront Scripts] head.html was not updated: ${(error as Error).message ?? 'unknown'}`);
        return { ...none, written: false };
    }
}

/**
 * `delayed.js` without the old copies whose replacements are in place. A copy that is not
 * there exactly as Demo Builder wrote it is left, and logged: it is somebody's edit, or a
 * block whose end is a guess.
 *
 * @returns the new content, or null when nothing changes
 */
function withoutOldCopies(content: string, remove: { smart404: boolean; inspector: boolean }, logger: Logger): string | null {
    let next = content;
    if (remove.smart404) {
        const outcome = withoutDelayedJsHandler(next);
        if (outcome.kind === 'removed') next = outcome.content;
        if (outcome.kind === 'half-marked') {
            logger.warn('[Storefront Scripts] delayed.js has the old smart 404 block with no end marker — left as it is; take it out by hand');
        }
    }
    if (remove.inspector && next.includes(INSPECTOR_DELAYED_MARKER)) {
        const at = next.indexOf(INSPECTOR_DELAYED_SNIPPET);
        if (at === -1) {
            logger.warn('[Storefront Scripts] delayed.js loads the Demo Inspector in a hand-edited form — left as it is; it may start twice');
        } else {
            next = next.slice(0, at) + next.slice(at + INSPECTOR_DELAYED_SNIPPET.length);
        }
    }
    return next === content ? null : next;
}

/**
 * Take the old copies out of `scripts/delayed.js` whose replacements are in place. Re-reads
 * and retries exactly once on a stale sha: a reset's tree commit has just rewritten the file,
 * and the Contents API can serve it from before that commit.
 *
 * @param remove - which copies have their replacement in place
 * @returns false when a copy is still there and should not be: the file could not be read,
 *   or the write was refused
 */
export async function cleanDelayedJs(
    fileOps: FileOps,
    target: Repo,
    remove: { smart404: boolean; inspector: boolean },
    logger: Logger,
): Promise<boolean> {
    if (!remove.smart404 && !remove.inspector) return true;
    const write = (content: string, sha: string | undefined) =>
        fileOps.createOrUpdateFile(target.owner, target.repo, DELAYED_JS, content, DELAYED_COMMIT, sha);
    try {
        const existing = await fileOps.getFileContent(target.owner, target.repo, DELAYED_JS);
        const next = existing?.content ? withoutOldCopies(existing.content, remove, logger) : null;
        if (next === null) return true;
        try {
            await write(next, existing?.sha);
        } catch (error) {
            if (!isStaleShaFailure(error)) throw error;
            const fresh = await fileOps.getFileContent(target.owner, target.repo, DELAYED_JS);
            if (!fresh?.content) throw error;
            const retried = withoutOldCopies(fresh.content, remove, logger);
            if (retried !== null) await write(retried, fresh.sha);
        }
        logger.info(`[Storefront Scripts] Took Demo Builder's old copies out of delayed.js (${target.owner}/${target.repo})`);
        return true;
    } catch (error) {
        logger.warn(`[Storefront Scripts] delayed.js was not cleaned: ${(error as Error).message ?? 'unknown'} — the old copy still runs`);
        return false;
    }
}
