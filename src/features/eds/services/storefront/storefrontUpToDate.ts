/**
 * Bring a storefront up to Demo Builder's current fixes: the one step creation, reset and a
 * tested-boilerplate update all run, so a storefront ends the same whichever path it took.
 *
 * It runs the storefront repairs (`storefrontRepairs.ts`) against the repository's files on
 * GitHub, and, when the smart 404 handler is installed, adds its eager redirect to the same
 * 404.html content: two writes to one file in a row race on its sha, so both changes go in one.
 *
 * Each path has just made a tree commit, and the Contents API can serve a file from before it,
 * so each file is written against the sha it was read at and a stale read is refused rather
 * than written over the newer file.
 *
 * @module features/eds/services/storefront/storefrontUpToDate
 */

import { readShippedPatches } from '../patches/shippedPatchLedger';
import { installSmart404Handler, withEagerRedirect, type Pdp404InstallResult } from '../pdp/pdp404HandlerPublisher';
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
    /** Also add the smart 404 eager redirect to 404.html (the handler is installed). */
    eagerRedirect?: boolean;
    logger: Logger;
}

/**
 * Read the storefront and work out every write it needs. Writes nothing. Each file is read
 * once however many repairs ask for it.
 *
 * @param fileOps - reads the repository's files
 * @param target - the storefront repository
 * @param options - the retired list, and whether to add the eager redirect
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
    if (options.eagerRedirect) {
        const page = changed.get('404.html') ?? (await read('404.html'));
        const redirected = page === undefined ? null : withEagerRedirect(page, options.logger);
        if (redirected) changed.set('404.html', redirected);
    }
    return { changed, shas, done };
}

/**
 * Each file in its own write, against the sha it was read at. Never throws; a refusal is logged.
 *
 * @returns whether every file was written
 */
async function writeGuarded(
    fileOps: Pick<GitHubFileOperations, 'createOrUpdateFile'>,
    target: StorefrontRepo,
    plan: StorefrontRepairPlan,
    logger: Logger,
): Promise<boolean> {
    let all = true;
    for (const [path, content] of plan.changed) {
        const sha = plan.shas.get(path);
        try {
            await fileOps.createOrUpdateFile(target.owner, target.repo, path, content, STOREFRONT_REPAIR_COMMIT, sha);
            logger.info(`[Storefront Repair] Updated ${path} (${target.owner}/${target.repo})`);
        } catch (error) {
            all = false;
            logger.warn(`[Storefront Repair] ${path} was not updated: ${(error as Error).message ?? 'unknown'}`);
        }
    }
    return all;
}

/**
 * Everything creation, reset and a tested-boilerplate update do to leave a storefront current:
 * the smart 404 handler (BYOM, product pages), then every storefront repair it needs, with the
 * eager redirect in 404.html when the handler is installed. Never throws.
 *
 * @returns the smart 404 handler's result, which the callers report from, and `current`:
 *   true when the storefront needed nothing or every write landed; false when the storefront
 *   or a patch ledger could not be read, or a write was refused. Creation and reset record a storefront that is
 *   not current as needing a reset (`storefrontChanges.ts`).
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
    const smart404 = await installSmart404Handler(
        githubFileOps, repoOwner, repoName, overlayUrl, logger, daLiveOrg, daLiveSite,
    );
    const target = { owner: repoOwner, repo: repoName };
    try {
        const { live: known, retired, complete } = await readShippedPatches(logger);
        const plan = await planStorefrontRepairs(githubFileOps, target, {
            retired, known, eagerRedirect: smart404.installed, logger,
        });
        logger.info(`[Storefront Repair] Repairs to make: ${plan.done.map((r) => r.id).join(', ') || 'none'}`);
        // A ledger that could not be read may hold fixes this storefront lacks: what was read
        // still goes in, but the storefront is not current until a build reads them all.
        if (!complete) logger.warn('[Storefront Repair] Not every patch ledger was read; the storefront needs a reset');
        if (plan.changed.size === 0) {
            if (complete) logger.info('[Storefront Repair] The storefront is already current');
            return { smart404, current: complete };
        }
        const written = await writeGuarded(githubFileOps, target, plan, logger);
        return { smart404, current: written && complete };
    } catch (error) {
        logger.warn(`[Storefront Repair] The storefront was not checked: ${(error as Error).message ?? 'unknown'}`);
        return { smart404, current: false };
    }
}
