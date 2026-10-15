/**
 * The storefront's static `404.html`, which Helix serves for any missing page (EDS-45).
 *
 * The file carries its OWN import map. On `adobe-commerce/boilerplate-b2b-template` that map
 * names 4 dropins while `head.html`'s names 18, and the start-up code loads the company
 * switcher whenever `commerce-companies-enabled` is on, a flag Demo Builder sets for B2B
 * packages. The import fails, the page never initialises, and every missing page draws blank
 * (measured on skukla/my-commerce-demo and skukla/kukla-justrite, 2026-10-15; the non-B2B
 * boilerplate renders because its start-up code needs only what its 404 map names).
 *
 * The fix reads the list from the site's own `head.html`, so nothing is hardcoded and it keeps
 * up when the template adds dropins. It only ADDS entries: an entry the 404 page already maps,
 * however it maps it, is left alone, and an unreadable map is not touched at all.
 *
 * This module owns every write to `404.html`. The product-page redirect (BYOM) used to write
 * the file separately; two Contents-API writes in a row race on the file's sha, so both
 * changes are applied to one read and land in one commit.
 *
 * @module features/eds/services/storefront/notFoundPage
 */

import { installSmart404Handler, withEagerRedirect, type Pdp404InstallResult } from '../pdp/pdp404HandlerPublisher';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type { Logger } from '@/types/logger';

const IMPORT_MAP = /<script\b[^>]*\btype=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i;

/** The `imports` of a page's import map, or null when it has none or it does not parse. */
function readImports(html: string): Record<string, string> | null {
    const body = IMPORT_MAP.exec(html)?.[1];
    if (body === undefined) return null;
    try {
        const parsed = JSON.parse(body) as { imports?: unknown };
        const imports = parsed.imports;
        return imports && typeof imports === 'object' ? (imports as Record<string, string>) : null;
    } catch {
        return null;
    }
}

/**
 * The 404 page with every import-map entry `head.html` has and it lacks, added as lines in
 * the page's own indentation after its last entry. Nothing else in the file moves.
 *
 * @param headHtml - the site's head.html
 * @param notFoundHtml - the site's 404.html
 * @returns the aligned page, or null when nothing is missing or either map cannot be read
 */
export function alignNotFoundImportMap(headHtml: string, notFoundHtml: string): string | null {
    const wanted = readImports(headHtml);
    const has = readImports(notFoundHtml);
    if (!wanted || !has) return null;
    const missing = Object.keys(wanted).filter((key) => !(key in has));
    if (missing.length === 0) return null;

    // The last entry line inside the 404 page's map: the new lines go after it.
    const keys = Object.keys(has);
    const lastKey = keys[keys.length - 1];
    if (lastKey === undefined) return null;
    const lastEntry = new RegExp(`^([ \\t]*)${JSON.stringify(lastKey).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*:\\s*"[^"\\n]*"`, 'm');
    const found = lastEntry.exec(notFoundHtml);
    if (!found) return null;
    const indent = found[1];
    const added = missing.map((key) => `${indent}${JSON.stringify(key)}: ${JSON.stringify(wanted[key])}`);
    const end = found.index + found[0].length;
    const aligned = `${notFoundHtml.slice(0, end)},\n${added.join(',\n')}${notFoundHtml.slice(end)}`;

    // Proof it still parses and gained exactly what was missing; anything else is not written.
    const check = readImports(aligned);
    return check && missing.every((key) => check[key] === wanted[key]) ? aligned : null;
}

/** What one commit to 404.html says it did. */
function commitMessage(aligned: boolean, redirected: boolean): string {
    if (aligned && redirected) {
        return 'chore(demo-builder): give 404.html the dropins head.html loads, and the smart 404 eager redirect';
    }
    return aligned
        ? 'chore(demo-builder): give 404.html the dropins head.html loads'
        : 'chore(demo-builder): vendor smart 404 eager redirect into 404.html';
}

/**
 * Bring the storefront's 404.html up to date in one read and one write: the import-map
 * entries it lacks, and the product-page eager redirect when the caller asks for it. Never
 * throws; every skip and failure is logged, and the storefront keeps the page it had.
 *
 * @param githubFileOps - reads and writes the repository's files
 * @param repoOwner - the storefront repository's owner
 * @param repoName - the storefront repository's name
 * @param logger - where each outcome is said
 * @param options - `eagerRedirect`: also insert the smart 404 redirect (BYOM installed)
 */
export async function updateNotFoundPage(
    githubFileOps: Pick<GitHubFileOperations, 'getFileContent' | 'createOrUpdateFile'>,
    repoOwner: string,
    repoName: string,
    logger: Logger,
    options: { eagerRedirect: boolean },
): Promise<void> {
    const page = await githubFileOps.getFileContent(repoOwner, repoName, '404.html');
    if (!page?.content) {
        logger.warn('[404 Page] The storefront has no 404.html — nothing to update');
        return;
    }
    const head = await githubFileOps.getFileContent(repoOwner, repoName, 'head.html');
    const aligned = head?.content ? alignNotFoundImportMap(head.content, page.content) : null;
    const base = aligned ?? page.content;
    const redirected = options.eagerRedirect ? withEagerRedirect(base, logger) : null;
    const next = redirected ?? base;
    if (next === page.content) {
        logger.info('[404 Page] 404.html is already current');
        return;
    }
    try {
        await githubFileOps.createOrUpdateFile(
            repoOwner,
            repoName,
            '404.html',
            next,
            commitMessage(aligned !== null, redirected !== null),
            page.sha,
        );
        logger.info(`[404 Page] Updated 404.html (${repoOwner}/${repoName})`);
    } catch (error) {
        logger.warn(`[404 Page] 404.html was not updated: ${(error as Error).message ?? 'unknown'}`);
    }
}

/**
 * Everything creation and reset do for a page that is not there: the smart 404 handler
 * (BYOM, product pages), then 404.html in one write, with the eager redirect when the
 * handler is installed. One call at both sites, so creation and reset stay the same.
 *
 * @returns the smart 404 handler's result, which both callers report from
 */
export async function installMissingPageHandling(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    overlayUrl: string | undefined,
    logger: Logger,
    daLiveOrg: string,
    daLiveSite: string,
): Promise<Pdp404InstallResult> {
    const smart404 = await installSmart404Handler(
        githubFileOps, repoOwner, repoName, overlayUrl, logger, daLiveOrg, daLiveSite,
    );
    await updateNotFoundPage(githubFileOps, repoOwner, repoName, logger, { eagerRedirect: smart404.installed });
    return smart404;
}
