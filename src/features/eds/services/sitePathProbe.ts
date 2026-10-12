/**
 * Ask a published site which paths it serves.
 *
 * The content copy asks twice (EDS-40): the SOURCE before it copies, so it carries
 * what the source has, and the storefront afterwards, so it can say what did not
 * arrive. Both are requests to a public CDN that owes the copy nothing, so every
 * call here is bounded: a cap on how many paths are asked for, a limit on how many
 * requests are in flight, a timeout per request, and a total time after which it
 * stops asking. Nothing throws. A request that fails is `unknown`, and what
 * `unknown` means is the caller's call: on the source it is "not there", on the
 * storefront it is "could not check".
 *
 * A path is written the way a browser asks for it: `/cart` for a page,
 * `/placeholders/cart.json` for a sheet.
 *
 * Keep this module `vscode`-free (the MCP server runs a reset in a separate Node
 * process).
 *
 * @module features/eds/services/sitePathProbe
 */

import { readServedSheets } from './daLive/daLiveSpreadsheetUtils';
import { runInBatches } from '@/core/utils/promiseUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/** How much one round of probes may cost. */
export interface ProbeLimits {
    /** The most paths asked for; the rest come back `unknown`. */
    maxPaths: number;
    /** The most requests in flight at once. */
    concurrency: number;
    /** Stop starting new requests after this long. */
    budgetMs: number;
}

/**
 * The default bounds. 400 paths at 8 at a time is 50 rounds; a healthy CDN answers
 * a round in well under a second. A site that hangs costs the budget plus one
 * request's timeout, and no more.
 */
export const PROBE_LIMITS: ProbeLimits = {
    maxPaths: 400,
    concurrency: 8,
    budgetMs: TIMEOUTS.NORMAL,
};

/** Every path asked about, sorted into what the site said. Input order is kept. */
export interface ProbeResult {
    served: string[];
    /** The site answered, and not with the document. */
    absent: string[];
    /** No answer: the request failed, timed out, or was never made. */
    unknown: string[];
}

type ProbeAnswer = keyof ProbeResult;

/** Is this web path a sheet's? */
export function isSheetPath(webPath: string): boolean {
    return webPath.endsWith('.json');
}

/** The published base URL of a DA.live content site. */
export function contentSiteBaseUrl(site: { org: string; site: string }): string {
    return `https://main--${site.site}--${site.org}.aem.live`;
}

/**
 * The URL that says whether a site serves a path.
 *
 * A sheet is asked for at its own `.json`. A page is asked for at the
 * `.plain.html` the copy reads, never the bare URL: a `/customer` page gates to a
 * login at the bare URL, and a file in the repository can answer a bare URL
 * without being a document the copy can read.
 */
export function probeUrl(baseUrl: string, webPath: string): string {
    return isSheetPath(webPath) ? `${baseUrl}${webPath}` : `${baseUrl}${webPath}.plain.html`;
}

/** A sheet is served when the URL answers 200 with JSON that holds a row list. */
async function probeSheet(url: string): Promise<ProbeAnswer> {
    const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(TIMEOUTS.QUICK) });
    if (!response.ok) return 'absent';
    try {
        return readServedSheets(await response.json()) ? 'served' : 'absent';
    } catch {
        // 200 with a body that is not JSON: a page, not a sheet.
        return 'absent';
    }
}

async function probeOne(baseUrl: string, webPath: string): Promise<ProbeAnswer> {
    const url = probeUrl(baseUrl, webPath);
    try {
        if (isSheetPath(webPath)) return await probeSheet(url);
        const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(TIMEOUTS.QUICK) });
        return response.ok ? 'served' : 'absent';
    } catch {
        return 'unknown';
    }
}

/**
 * Ask a site for each path and sort them by its answer.
 *
 * @param baseUrl - the site's published origin, no trailing slash
 * @param webPaths - the paths to ask about, as a browser would request them
 * @param limits - the bounds; the defaults are {@link PROBE_LIMITS}
 * @returns every path, under exactly one of `served`, `absent` or `unknown`
 */
export async function probePaths(
    baseUrl: string,
    webPaths: readonly string[],
    limits: ProbeLimits = PROBE_LIMITS,
): Promise<ProbeResult> {
    const result: ProbeResult = { served: [], absent: [], unknown: [] };
    const asked = webPaths.slice(0, limits.maxPaths);
    const deadline = Date.now() + limits.budgetMs;

    const answers = await runInBatches(asked, limits.concurrency, (webPath) =>
        Date.now() >= deadline ? Promise.resolve<ProbeAnswer>('unknown') : probeOne(baseUrl, webPath),
    );

    asked.forEach((webPath, index) => result[answers[index]].push(webPath));
    result.unknown.push(...webPaths.slice(limits.maxPaths));
    return result;
}
