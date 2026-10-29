/**
 * Bring a storefront up to Demo Builder's current fixes: the one step creation, reset and a
 * tested-boilerplate update all run, so a storefront ends the same whichever path it took.
 *
 * It runs the storefront repairs (`storefrontRepairs.ts`) against the repository's files on
 * GitHub, and, when BYOM is on, puts the smart 404 scripts in the same 404.html content: the
 * eager script in `<head>` and the recovery script at the end of the body (`pdp404Page.ts`).
 * Two writes to one file in a row race on its sha, so every change to it goes in one. Only
 * once that write has landed does Demo Builder's old copy of the recovery script come out of
 * `scripts/delayed.js`, so a storefront is never without it and never runs it twice.
 *
 * Each path has just made a tree commit, and the Contents API can serve a file from before it,
 * so each file is written against the sha it was read at and a stale read is refused rather
 * than written over the newer file.
 *
 * @module features/eds/services/storefront/storefrontUpToDate
 */

import { readShippedPatches } from '../patches/shippedPatchLedger';
import {
    prepareSmart404Handler,
    retireDelayedJsHandler,
    type Pdp404InstallResult,
} from '../pdp/pdp404HandlerPublisher';
import { type BlockOutcome, withEagerRedirect, withRecoveryHandler } from '../pdp/pdp404Page';
import { runStorefrontRepairs, type StorefrontRepair, type StorefrontRepairFiles } from './storefrontRepairs';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type { Logger } from '@/types/logger';

/** The commit message every repair write carries. */
export const STOREFRONT_REPAIR_COMMIT = "fix: bring the storefront up to Demo Builder's current fixes";

/** What a repair run would write: the files, the sha each was read at, and the repairs done. */
export interface StorefrontRepairPlan {
    changed: Map<string, string>;
    shas: Map<string, string>;
    done: StorefrontRepair[];
    /** What the plan does with the smart 404 recovery script in 404.html, when it was given one. */
    smart404?: BlockOutcome;
}

/** The repository a run reads and writes. */
export interface StorefrontRepo {
    owner: string;
    repo: string;
}

/** What a plan is built from beside the repository's own files. */
export interface StorefrontPlanOptions {
    retired: StorefrontRepairFiles['retired'];
    known: StorefrontRepairFiles['known'];
    /** The smart 404 recovery script for 404.html (BYOM on), with the eager script beside it. */
    smart404Handler?: string;
    logger: Logger;
}

/**
 * Read the storefront and work out every write it needs. Writes nothing. Each file is read
 * once however many repairs ask for it.
 *
 * @param fileOps - reads the repository's files
 * @param target - the storefront repository
 * @param options - the retired list, and the smart 404 script to put in 404.html
 */
export async function planStorefrontRepairs(
    fileOps: Pick<GitHubFileOperations, 'getFileContent'>,
    target: StorefrontRepo,
    options: StorefrontPlanOptions,
): Promise<StorefrontRepairPlan> {
    const shas = new Map<string, string>();
    const reads = new Map<string, Promise<string | undefined>>();
    const read = (path: string): Promise<string | undefined> => {
        let pending = reads.get(path);
        if (!pending) {
            pending = fileOps.getFileContent(target.owner, target.repo, path).then((file) => {
                if (file?.sha) shas.set(path, file.sha);
                return file?.content;
            });
            reads.set(path, pending);
        }
        return pending;
    };
    const { changed, done } = await runStorefrontRepairs({ read, retired: options.retired, known: options.known });
    if (options.smart404Handler === undefined) return { changed, shas, done };
    const smart404 = await planSmart404Page(changed, read, options.smart404Handler, options.logger);
    return { changed, shas, done, smart404 };
}

/**
 * Both smart 404 scripts, made current in 404.html on top of whatever the repairs did to it.
 *
 * @returns what became of the recovery script
 */
async function planSmart404Page(
    changed: Map<string, string>,
    read: (path: string) => Promise<string | undefined>,
    handler: string,
    logger: Logger,
): Promise<BlockOutcome> {
    const page = changed.get('404.html') ?? (await read('404.html'));
    if (page === undefined) return { kind: 'skipped', reason: '404.html missing' };
    const withEager = withEagerRedirect(page, logger) ?? page;
    const outcome = withRecoveryHandler(withEager, handler);
    const next = outcome.kind === 'changed' ? outcome.html : withEager;
    if (next !== page) changed.set('404.html', next);
    return outcome;
}

/**
 * Each file in its own write, against the sha it was read at. Never throws; a refusal is logged.
 *
 * @returns the files that were not written
 */
async function writeGuarded(
    fileOps: Pick<GitHubFileOperations, 'createOrUpdateFile'>,
    target: StorefrontRepo,
    plan: StorefrontRepairPlan,
    logger: Logger,
): Promise<Set<string>> {
    const failed = new Set<string>();
    for (const [path, content] of plan.changed) {
        const sha = plan.shas.get(path);
        try {
            await fileOps.createOrUpdateFile(target.owner, target.repo, path, content, STOREFRONT_REPAIR_COMMIT, sha);
            logger.info(`[Storefront Repair] Updated ${path} (${target.owner}/${target.repo})`);
        } catch (error) {
            failed.add(path);
            logger.warn(`[Storefront Repair] ${path} was not updated: ${(error as Error).message ?? 'unknown'}`);
        }
    }
    return failed;
}

/** Whether the recovery script is in 404.html once the plan's writes are done. */
function smart404After(outcome: BlockOutcome | undefined, failed: Set<string>): Pdp404InstallResult {
    if (!outcome) return { installed: false, reason: '404.html missing' };
    if (outcome.kind === 'skipped') return { installed: false, reason: outcome.reason };
    if (outcome.kind === 'changed' && failed.has('404.html')) {
        return { installed: false, reason: '404.html was not written' };
    }
    return { installed: true };
}

/**
 * Everything creation, reset and a tested-boilerplate update do to leave a storefront current:
 * every storefront repair it needs and, when BYOM is on, the smart 404 scripts (head.html, and
 * both in 404.html), then the old recovery script out of delayed.js. Never throws.
 *
 * @returns the smart 404 result, which the callers report from, and `current`: true when the
 *   storefront needed nothing or every write landed; false when the storefront or a patch
 *   ledger could not be read, a write was refused, or the old copy is still in delayed.js.
 *   Creation and reset record a storefront that is not current as needing a reset
 *   (`storefrontChanges.ts`).
 */
export async function bringStorefrontUpToDate(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    overlayUrl: string | undefined,
    logger: Logger,
    daLiveOrg: string,
    daLiveSite: string,
): Promise<{ smart404: Pdp404InstallResult; current: boolean }> {
    const prepared = await prepareSmart404Handler(
        githubFileOps, repoOwner, repoName, overlayUrl, logger, daLiveOrg, daLiveSite,
    );
    const handler = 'handler' in prepared ? prepared.handler : undefined;
    const skipped = 'handler' in prepared ? undefined : prepared;
    const target = { owner: repoOwner, repo: repoName };
    try {
        const { live: known, retired, complete } = await readShippedPatches(logger);
        const plan = await planStorefrontRepairs(githubFileOps, target, {
            retired, known, smart404Handler: handler, logger,
        });
        logger.info(`[Storefront Repair] Repairs to make: ${plan.done.map((r) => r.id).join(', ') || 'none'}`);
        // A ledger that could not be read may hold fixes this storefront lacks: what was read
        // still goes in, but the storefront is not current until a build reads them all.
        if (!complete) logger.warn('[Storefront Repair] Not every patch ledger was read; the storefront needs a reset');
        if (plan.changed.size === 0 && complete) logger.info('[Storefront Repair] The storefront is already current');
        const failed = await writeGuarded(githubFileOps, target, plan, logger);
        const smart404 = skipped ?? smart404After(plan.smart404, failed);
        // Only once 404.html has the script: a storefront is never left without one.
        const retiredOk = smart404.installed ? await retireDelayedJsHandler(githubFileOps, repoOwner, repoName, logger) : true;
        return { smart404, current: failed.size === 0 && complete && retiredOk };
    } catch (error) {
        logger.warn(`[Storefront Repair] The storefront was not checked: ${(error as Error).message ?? 'unknown'}`);
        const smart404 = skipped ?? { installed: false, reason: 'the storefront could not be read' };
        return { smart404, current: false };
    }
}
