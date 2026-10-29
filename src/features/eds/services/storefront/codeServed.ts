/**
 * After a code publish, confirm the live site serves the code the repository has, and
 * publish again any file it does not.
 *
 * A code publish (`previewCode('/*')`) is a job AEM runs from its own copy of the
 * repository, and that copy lags a push by seconds. On 2026-10-23 a reset of JustRite
 * committed three fixes in the last five seconds before its publish; the publish
 * reported success, the site kept the files from before the fixes, and the product
 * links stayed broken while the card said the storefront was current. Nothing had
 * looked at what the site served.
 *
 * So: for each text file the run changed, compare the site's copy with the
 * repository's at the branch head. A file that differs is published on its own and
 * looked at again, a bounded number of times. What still differs is returned, for the
 * caller to say and to keep the storefront marked as not current.
 *
 * Never throws: a request that fails counts as "not served", and a publish that fails
 * is logged and looked at again like any other.
 *
 * @module features/eds/services/storefront/codeServed
 */

import { hlxIgnored, parseHlxIgnore } from './hlxIgnore';
import { aemLiveBaseUrl } from './storefrontProbe';
import { runInBatches } from '@/core/utils/promiseUtils';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type { HelixService } from '@/features/eds/services/helix/helixService';
import type { Logger } from '@/types/logger';

/** Files whose content can be compared as text; anything else is not checked. */
const TEXT_FILE = /\.(?:js|mjs|css|html|json|svg|txt|xml)$/i;

/** How many changed files are checked; a run changes a handful. */
const MAX_FILES = 100;

/** How many times a file that differs is published again before it is reported. */
const PUBLISH_ROUNDS = 3;

/** How many files are fetched at once. */
const CONCURRENCY = 8;

/**
 * Two files every storefront's pages load. They come in the template's commit and no later
 * commit need touch them, so the changed-file check never looks at them. On
 * mrajkovich/bodea (2026-10-27, EDS-66) AEM accepted the publish of `/*` and never brought
 * the template's files: the site served no styles and no scripts, and nothing looked.
 */
const TEMPLATE_PROBES = ['scripts/aem.js', 'styles/styles.css'];

/** What the check reads and does; built by {@link codeServedDeps}, faked in tests. */
export interface CodeServedDeps {
    /** The repository's copy of a file at the branch head, or undefined when it has none. */
    repoText: (path: string) => Promise<string | undefined>;
    /** The live site's copy, or undefined when it serves none. */
    servedText: (path: string) => Promise<string | undefined>;
    /** Publish one file's code again. */
    publish: (path: string) => Promise<void>;
    /** Wait between a publish and the next look. */
    pause: (ms: number) => Promise<void>;
    logger: Logger;
}

/**
 * An HTML file as AEM serves it: AEM moves a `<meta … move-to-http-header="true">` into a
 * response header and gives every `nonce="aem"` a fresh value per request, so the served
 * copy never equals the committed one byte for byte. Both are undone, and whitespace
 * folded, before comparing. Measured 2026-10-23 on JustRite's 404.html and head.html.
 */
function asServedHtml(text: string): string {
    return text
        .replace(/<meta\b[^>]*\bmove-to-http-header="true"[^>]*>/gis, '')
        .replace(/\bnonce="[^"]*"/g, 'nonce=""')
        .replace(/\s+/g, ' ')
        .trim();
}

/** The two copies say the same thing, as far as what AEM changes on the way out allows. */
function same(path: string, repo: string, served: string): boolean {
    if (/\.html$/i.test(path)) return asServedHtml(repo) === asServedHtml(served);
    return repo.replace(/\r\n/g, '\n') === served.replace(/\r\n/g, '\n');
}

/** The files among `paths` the site does not serve as the repository has them. */
async function notServed(paths: readonly string[], deps: CodeServedDeps): Promise<string[]> {
    const verdicts = await runInBatches([...paths], CONCURRENCY, async (path) => {
        const [repo, served] = await Promise.all([
            deps.repoText(path).catch(() => undefined),
            deps.servedText(path).catch(() => undefined),
        ]);
        // Nothing to compare against: not this check's to judge.
        if (repo === undefined) return undefined;
        return served !== undefined && same(path, repo, served) ? undefined : path;
    });
    return verdicts.filter((path): path is string => path !== undefined);
}

/**
 * Confirm the site serves each changed file as the repository has it, publishing again
 * the ones it does not.
 *
 * @param changed - the files the run changed, repository paths (`scripts/commerce.js`)
 * @param deps - how to read both copies and publish one file
 * @returns the files the site still does not serve as committed; empty when all match
 */
export async function confirmCodeServed(changed: readonly string[], deps: CodeServedDeps): Promise<string[]> {
    const checked = changed.filter((path) => TEXT_FILE.test(path)).slice(0, MAX_FILES);
    let stale = await notServed(checked, deps);
    for (let round = 0; round < PUBLISH_ROUNDS && stale.length > 0; round++) {
        deps.logger.info(`[Code Served] Publishing again what the site does not serve yet: ${stale.join(', ')}`);
        for (const path of stale) {
            await deps.publish(path).catch((error: unknown) => {
                deps.logger.warn(`[Code Served] Could not publish ${path}: ${(error as Error).message}`);
            });
        }
        await deps.pause(TIMEOUTS.CODE_SERVED_RECHECK);
        stale = await notServed(stale, deps);
    }
    if (stale.length > 0) deps.logger.warn(`[Code Served] Still not served as committed: ${stale.join(', ')}`);
    else deps.logger.info(`[Code Served] The site serves all ${checked.length} changed files as committed`);
    return stale;
}

/**
 * Confirm the site serves the template's code, publishing ALL the code again when it does
 * not: a missing probe means the template is missing as a whole, which file by file would
 * not mend. Republish does the same, and it is what mended mrajkovich/bodea.
 *
 * @param deps - how to read both copies and publish
 * @returns the probe files the site still does not serve; empty when it serves them
 */
async function confirmTemplateServed(deps: CodeServedDeps): Promise<string[]> {
    let missing = await notServed(TEMPLATE_PROBES, deps);
    for (let round = 0; round < PUBLISH_ROUNDS && missing.length > 0; round++) {
        deps.logger.info(
            `[Code Served] The site does not serve the template's code (${missing.join(', ')}); publishing all the code again`,
        );
        await deps.publish('*').catch((error: unknown) => {
            deps.logger.warn(`[Code Served] Could not publish all the code: ${(error as Error).message}`);
        });
        await deps.pause(TIMEOUTS.CODE_SERVED_RECHECK);
        missing = await notServed(missing, deps);
    }
    if (missing.length > 0) deps.logger.warn(`[Code Served] Still not serving the template's code: ${missing.join(', ')}`);
    return missing;
}

/**
 * The sentence for a site that does not serve the template's code.
 *
 * @param missing - what {@link confirmTemplateServed} returned
 * @returns the sentence
 */
function templateNotServedSentence(missing: readonly string[]): string {
    return (
        `The storefront's code did not reach the live site (${missing.join(', ')}), so its pages show ` +
        'without styles or scripts. Select Republish on the project dashboard to publish the code again.'
    );
}

/**
 * The sentence for files the site still does not serve.
 *
 * @param stale - what {@link confirmCodeServed} returned
 * @returns the sentence, or undefined when there is nothing to say
 */
export function codeNotServedSentence(stale: readonly string[]): string | undefined {
    if (stale.length === 0) return undefined;
    const files = stale.length === 1 ? '1 code file' : `${stale.length} code files`;
    return (
        `${files} did not reach the live site (${stale.join(', ')}), so it still runs the old code. ` +
        'Select Republish on the project dashboard to publish the code again.'
    );
}

/**
 * The real reads and publish for one storefront.
 *
 * @param githubFileOps - reads the repository
 * @param helix - publishes code
 * @param site - the storefront's repository
 * @param head - the commit the repository's copies are read at
 * @param logger - for the check's lines
 */
export function codeServedDeps(
    githubFileOps: Pick<GitHubFileOperations, 'getFileContent'>,
    helix: Pick<HelixService, 'previewCode'>,
    site: { owner: string; repo: string },
    head: string,
    logger: Logger,
): CodeServedDeps {
    const base = aemLiveBaseUrl(site.owner, site.repo);
    return {
        repoText: async (path) =>
            (await githubFileOps.getFileContent(site.owner, site.repo, path, head))?.content,
        servedText: async (path) => {
            const response = await fetch(`${base}/${path}?served=${Date.now()}`, {
                cache: 'no-store',
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });
            return response.ok ? response.text() : undefined;
        },
        publish: (path) => helix.previewCode(site.owner, site.repo, `/${path}`),
        pause: sleep,
        logger,
    };
}

/** The repository reads the whole check needs. */
type StorefrontRepoReads = Pick<GitHubFileOperations, 'getFileContent' | 'getLatestCommitSha'> & {
    treeCommits: Pick<GitHubFileOperations['treeCommits'], 'filesChangedSince' | 'earliestRecentCommitSha'>;
};

/**
 * The whole check for one storefront: first the template's own code (two files every
 * page loads, all the code published again when they are missing), then every file
 * committed after `since` (or, for a storefront just created, after the commit its
 * template made), compared on the site and published again where it differs. Creation and reset both run it, after their
 * content copy, so AEM has had minutes to catch up first.
 *
 * Never throws: a check that cannot run is logged and says nothing.
 *
 * @param githubFileOps - reads the repository
 * @param helix - publishes code
 * @param site - the storefront's repository
 * @param since - the commit to check from; undefined for the template's own commit
 * @param logger - for the check's lines
 * @returns a sentence for the SC when some code did not reach the site, else undefined
 */
export async function confirmStorefrontCodeServed(
    githubFileOps: StorefrontRepoReads,
    helix: Pick<HelixService, 'previewCode'>,
    site: { owner: string; repo: string },
    since: string | undefined,
    logger: Logger,
): Promise<string | undefined> {
    try {
        const head = await githubFileOps.getLatestCommitSha(site.owner, site.repo);
        const base = since ?? (await githubFileOps.treeCommits.earliestRecentCommitSha(site.owner, site.repo));
        if (!head || !base || head === base) return undefined;
        // What the storefront tells AEM never to serve is not "missing" (Bodea's `_*.json`).
        const hlxignore = (await githubFileOps.getFileContent(site.owner, site.repo, '.hlxignore', head))?.content;
        const rules = parseHlxIgnore(hlxignore ?? '');
        const changed = (await githubFileOps.treeCommits.filesChangedSince(site.owner, site.repo, base)).filter(
            (path) => !hlxIgnored(rules, path),
        );
        const deps = codeServedDeps(githubFileOps, helix, site, head, logger);
        const missing = await confirmTemplateServed(deps);
        if (missing.length > 0) return templateNotServedSentence(missing);
        return codeNotServedSentence(await confirmCodeServed(changed, deps));
    } catch (error) {
        logger.warn(`[Code Served] Could not check the code the site serves: ${(error as Error).message}`);
        return undefined;
    }
}
