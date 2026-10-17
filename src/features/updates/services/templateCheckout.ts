/**
 * The temporary clone every template sync works in: clone the SC's repository, back up
 * the files it never overwrites, fetch the template, hand the checkout over, and always
 * remove it afterwards; then stage, commit and push. Split from `templateSyncService.ts`
 * by job (2026-10-16, EDS-51).
 *
 * @module features/updates/services/templateCheckout
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { CommandResult } from '@/core/shell/types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { injectTokenIntoUrl } from '@/features/eds/services/github/githubHelpers';
import { backupPreservedFiles } from '@/features/updates/services/preservedFiles';
import { describeStepFailure, failure } from '@/features/updates/services/templateSyncMessages';
import { TemplateSyncStepError } from '@/features/updates/services/templateSyncStepError';
import type {
    Checkout,
    GitHubAccess,
    TemplateSyncResult,
    TemplateSyncTarget,
} from '@/features/updates/services/templateSyncTypes';
import type { Logger } from '@/types/logger';

/** What the checkout needs from its owner: a git runner, a logger, and the GitHub token. */
export interface SyncDeps {
    git: (cwd: string, command: string, timeout: number) => Promise<CommandResult>;
    logger: Logger;
    github: Pick<GitHubAccess, 'tokenService'>;
}

/**
 * Clone the SC's repo into a temp dir, back up the preserved files and fetch
 * the template, then hand the checkout to `work`. Any thrown step becomes a
 * failed result; the temp dir is always removed.
 */
export async function withCheckout(
    deps: SyncDeps,
    strategy: 'merge' | 'reset',
    target: TemplateSyncTarget,
    preserveFiles: string[],
    work: (checkout: Checkout) => Promise<TemplateSyncResult>,
): Promise<TemplateSyncResult> {
    // The SHARED instance. NOTE: this site only calls getToken() and never
    // validates, so a fresh instance cost nothing here — this is consistency with
    // the other call sites, not a fix for a redundant round trip.
    const { tokenService: githubTokenService } = deps.github;
    const token = await githubTokenService.getToken();
    if (!token) {
        return failure(strategy, 'Not authenticated with GitHub');
    }

    const { repoOwner, repoName, templateOwner, templateRepo } = target;
    const branch = target.repoBranch ?? 'main';
    const templateBranch = target.templateBranch ?? 'main';
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-sync-'));
    deps.logger.info(`[TemplateSync] Starting ${strategy} from ${templateOwner}/${templateRepo} to ${repoOwner}/${repoName}`);

    try {
        deps.logger.debug(`[TemplateSync] Cloning user repo`);
        const userRepoUrl = injectTokenIntoUrl(`https://github.com/${repoOwner}/${repoName}.git`, token.token);
        const depth = strategy === 'merge' ? 50 : 1;
        const clone = `git clone --depth ${depth} --branch ${branch} "${userRepoUrl}" repo`;
        const cloneResult = await deps.git(tempDir, clone, TIMEOUTS.LONG);
        if (cloneResult.code !== 0) {
            throw new TemplateSyncStepError(
                `Could not clone ${repoOwner}/${repoName} from GitHub.`, cloneResult.stderr,
            );
        }

        const repoDir = path.join(tempDir, 'repo');
        const backups = await backupPreservedFiles(repoDir, preserveFiles, deps.logger);

        deps.logger.debug(`[TemplateSync] Fetching template repo`);
        const templateUrl = `https://github.com/${templateOwner}/${templateRepo}.git`;
        await deps.git(repoDir, `git remote add template "${templateUrl}"`, TIMEOUTS.QUICK);
        // Another branch is fetched INTO template/main, the one ref the later steps name.
        const refspec = templateBranch === 'main' ? 'main' : `${templateBranch}:refs/remotes/template/main`;
        const fetchResult = await deps.git(repoDir, `git fetch template ${refspec}`, TIMEOUTS.LONG);
        if (fetchResult.code !== 0) {
            throw new TemplateSyncStepError(
                `Could not fetch the template ${templateOwner}/${templateRepo} from GitHub.`,
                fetchResult.stderr,
            );
        }

        return await work({ tempDir, repoDir, backups, branch });
    } catch (error) {
        const gitOutput = error instanceof TemplateSyncStepError ? `: ${error.gitOutput.trim()}` : '';
        const label = strategy === 'merge' ? 'Merge' : 'Reset';
        deps.logger.error(`[TemplateSync] ${label} failed${gitOutput}`, error as Error);
        return failure(strategy, describeStepFailure(error));
    } finally {
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
            deps.logger.warn(`[TemplateSync] Failed to clean up temp directory: ${(cleanupError as Error).message}`);
        }
    }
}

/** Stage everything, commit when anything is staged, and push. */
export async function commitAndPush(
    deps: SyncDeps,
    repoDir: string,
    message: string,
    pushCommand: string,
): Promise<void> {
    const staged = await deps.git(repoDir, `git add -A`, TIMEOUTS.QUICK);
    if (staged.code !== 0) {
        throw new TemplateSyncStepError("Could not stage the template's changes.", staged.stderr);
    }

    const statusResult = await deps.git(repoDir, `git status --porcelain`, TIMEOUTS.QUICK);
    if (statusResult.stdout.trim()) {
        const commit = `git commit -m "${message}"`;
        const commitResult = await deps.git(repoDir, commit, TIMEOUTS.QUICK);
        if (commitResult.code !== 0) {
            throw new TemplateSyncStepError(
                "Could not commit the template's changes.", commitResult.stderr,
            );
        }
    }

    deps.logger.debug(`[TemplateSync] Pushing to origin`);
    const pushResult = await deps.git(repoDir, pushCommand, TIMEOUTS.LONG);
    if (pushResult.code !== 0) {
        throw new TemplateSyncStepError('Could not push the update to GitHub.', pushResult.stderr);
    }
}
