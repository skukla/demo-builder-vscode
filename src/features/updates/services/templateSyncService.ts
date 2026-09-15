/**
 * Template Sync Service
 *
 * Applies upstream template updates to an EDS storefront project.
 * Supports two strategies:
 * - merge: applies the template's change SINCE the storefront's recorded
 *   template version (`lastSyncedCommit`) onto the SC's repo with a 3-way
 *   apply, keeping the SC's own edits (`templateMergeBase.ts`). It does not use
 *   `git merge`: a repo GitHub generates from a template has its own root commit
 *   and shares no history with the template, and git refuses to merge unrelated
 *   histories. A conflict STOPS the update and names the files; it is never
 *   resolved by resetting. A storefront with no recorded version is asked to
 *   reset once.
 * - reset: Full reset to template (replaces the SC's edits). Only ever run when
 *   the caller asked for it explicitly.
 *
 * Both strategies report the TEMPLATE commit the storefront now matches as
 * `syncedCommit`; callers record it as `lastSyncedCommit`, and the update
 * checker compares that against the template's latest commit.
 *
 * Key files (fstab.yaml, config.json) are preserved regardless of strategy.
 *
 * Known limit: both the template and the SC's repo are assumed to use `main`;
 * the storefront metadata records no branch for either.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { COMPONENT_IDS } from '@/core/constants';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { injectTokenIntoUrl } from '@/features/eds/services/github/githubHelpers';
import {
    applyTemplateChangeSince,
    readTemplateHead,
    type GitStep,
} from '@/features/updates/services/templateMergeBase';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/** Options for template sync operation */
export interface TemplateSyncOptions {
    /** Sync strategy: 'merge' applies the template's change, 'reset' does full reset */
    strategy: 'merge' | 'reset';
    /** Files to preserve (never overwritten) - always includes fstab.yaml */
    preserveFiles?: string[];
}

/** Result of template sync operation */
export interface TemplateSyncResult {
    /** Whether sync completed successfully */
    success: boolean;
    /** Strategy that ran */
    strategy: 'merge' | 'reset';
    /** The template commit the storefront now matches ('' on failure) */
    syncedCommit: string;
    /**
     * Files where the template's changes collide with the SC's own edits. Set
     * only on a merge that STOPPED: the checkout is restored, nothing is pushed,
     * `success` is false and `error` names the files. The caller decides what
     * happens next — a reset is a separate, explicit request, never a fallback.
     */
    conflicts?: string[];
    /** Error message if sync failed */
    error?: string;
}

/** Which repositories one sync moves between. */
interface SyncTarget {
    repoOwner: string;
    repoName: string;
    templateOwner: string;
    templateRepo: string;
}

/** A temp clone of the SC's repo with the template fetched and the preserved files backed up. */
interface Checkout {
    tempDir: string;
    repoDir: string;
    backups: Map<string, string>;
}

/** The error text a conflicted merge carries, so every surface says the same thing. */
function describeTemplateConflicts(conflicts: string[]): string {
    const noun = conflicts.length === 1 ? 'file' : 'files';
    return `Merge conflicts in ${conflicts.length} ${noun} (${conflicts.join(', ')}); `
        + 'the template update was not applied.';
}

const NO_RECORDED_VERSION = 'This storefront has no recorded template version to update from; '
    + 'reset it to its template once so updates have a starting point.';

/** A full or abbreviated commit SHA — the only shape a recorded version may take. */
const COMMIT_SHA = /^[0-9a-f]{7,40}$/i;

function notInTemplateHistory(base: string, target: SyncTarget): string {
    return `The storefront's recorded template version (${base.substring(0, 7)}) is not in `
        + `${target.templateOwner}/${target.templateRepo}'s history; reset it to its template `
        + 'once so updates have a new starting point.';
}

function failure(strategy: 'merge' | 'reset', error: string): TemplateSyncResult {
    return { success: false, strategy, syncedCommit: '', error };
}

/**
 * Files that should never be overwritten during template sync
 * These contain project-specific configuration
 */
const DEFAULT_PRESERVE_FILES = [
    'fstab.yaml',       // Helix content source configuration
    'config.json',      // Commerce endpoint configuration
];

/**
 * Template Sync Service
 *
 * Synchronizes an EDS project with its upstream template.
 */
export class TemplateSyncService {
    private logger: Logger;
    private secrets: vscode.SecretStorage;

    /** ADR-015: the executor joins the secrets + logger as an injected dependency. */
    constructor(
        secrets: vscode.SecretStorage,
        logger: Logger,
        private commandManager: CommandExecutor,
    ) {
        this.secrets = secrets;
        this.logger = logger;
    }

    /**
     * Sync local EDS project with upstream template
     *
     * @param project - Project to sync
     * @param options - Sync options (strategy and files to preserve)
     * @returns Sync result
     */
    async syncWithTemplate(
        project: Project,
        options: TemplateSyncOptions,
    ): Promise<TemplateSyncResult> {
        const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
        if (!edsInstance?.metadata) {
            return failure(options.strategy, 'No EDS metadata found in project');
        }

        const metadata = edsInstance.metadata as Record<string, unknown>;
        const githubRepo = metadata.githubRepo as string | undefined;
        const templateOwner = metadata.templateOwner as string | undefined;
        const templateRepo = metadata.templateRepo as string | undefined;

        if (!githubRepo || !templateOwner || !templateRepo) {
            return failure(
                options.strategy,
                'Missing required metadata: githubRepo, templateOwner, or templateRepo',
            );
        }

        const [repoOwner, repoName] = githubRepo.split('/');
        if (!repoOwner || !repoName) {
            return failure(options.strategy, `Invalid githubRepo format: ${githubRepo}`);
        }

        const target: SyncTarget = { repoOwner, repoName, templateOwner, templateRepo };
        const preserveFiles = [...DEFAULT_PRESERVE_FILES, ...(options.preserveFiles ?? [])];

        if (options.strategy === 'reset') {
            return this.withCheckout('reset', target, preserveFiles, (checkout) =>
                this.performReset(checkout),
            );
        }

        // The base of the merge. Thin-layer storefronts (ADR-006) record their
        // last-known-good commit here, which templateUpdateChecker compares within
        // the same template repo; their update policy is not changed by this service.
        const base = metadata.lastSyncedCommit;
        if (typeof base !== 'string' || !COMMIT_SHA.test(base)) {
            return failure('merge', NO_RECORDED_VERSION);
        }
        return this.withCheckout('merge', target, preserveFiles, (checkout) =>
            this.mergeFromBase(checkout, target, base, preserveFiles),
        );
    }

    /** Run one git step in `cwd` with the shared shell. */
    private git(cwd: string, command: string, timeout: number) {
        return this.commandManager.execute(command, { cwd, timeout, shell: DEFAULT_SHELL });
    }

    /**
     * Clone the SC's repo into a temp dir, back up the preserved files and fetch
     * the template, then hand the checkout to `work`. Any thrown step becomes a
     * failed result; the temp dir is always removed.
     */
    private async withCheckout(
        strategy: 'merge' | 'reset',
        target: SyncTarget,
        preserveFiles: string[],
        work: (checkout: Checkout) => Promise<TemplateSyncResult>,
    ): Promise<TemplateSyncResult> {
        // The SHARED instance. NOTE: this site only calls getToken() and never
        // validates, so a fresh instance cost nothing here — this is consistency with
        // the other call sites, not a fix for a redundant round trip.
        const { tokenService: githubTokenService } = getGitHubServices(this.secrets);
        const token = await githubTokenService.getToken();
        if (!token) {
            return failure(strategy, 'Not authenticated with GitHub');
        }

        const { repoOwner, repoName, templateOwner, templateRepo } = target;
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-sync-'));
        this.logger.info(`[TemplateSync] Starting ${strategy} from ${templateOwner}/${templateRepo} to ${repoOwner}/${repoName}`);

        try {
            this.logger.debug(`[TemplateSync] Cloning user repo...`);
            const userRepoUrl = injectTokenIntoUrl(`https://github.com/${repoOwner}/${repoName}.git`, token.token);
            const depth = strategy === 'merge' ? 50 : 1;
            const clone = `git clone --depth ${depth} --branch main "${userRepoUrl}" repo`;
            const cloneResult = await this.git(tempDir, clone, TIMEOUTS.LONG);
            if (cloneResult.code !== 0) {
                throw new Error(`Failed to clone user repo: ${cloneResult.stderr}`);
            }

            const repoDir = path.join(tempDir, 'repo');
            const backups = await this.backupPreservedFiles(repoDir, preserveFiles);

            this.logger.debug(`[TemplateSync] Fetching template repo...`);
            const templateUrl = `https://github.com/${templateOwner}/${templateRepo}.git`;
            await this.git(repoDir, `git remote add template "${templateUrl}"`, TIMEOUTS.QUICK);
            const fetchResult = await this.git(repoDir, `git fetch template main`, TIMEOUTS.LONG);
            if (fetchResult.code !== 0) {
                throw new Error(`Failed to fetch template: ${fetchResult.stderr}`);
            }

            return await work({ tempDir, repoDir, backups });
        } catch (error) {
            this.logger.error(`[TemplateSync] ${strategy === 'merge' ? 'Merge' : 'Reset'} failed`, error as Error);
            return failure(strategy, (error as Error).message);
        } finally {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
                this.logger.warn(`[TemplateSync] Failed to clean up temp directory: ${(cleanupError as Error).message}`);
            }
        }
    }

    /**
     * Apply the template's change from the recorded `base` to its latest commit,
     * keeping the SC's own edits, then commit and push.
     *
     * A conflict means the SC edited the same region the template changed. The
     * clone is restored and the files are reported; it is never turned into a
     * reset here (a user's own edits are never overwritten — CLAUDE.md, rule 2).
     */
    private async mergeFromBase(
        checkout: Checkout,
        target: SyncTarget,
        base: string,
        preserveFiles: string[],
    ): Promise<TemplateSyncResult> {
        const { tempDir, repoDir } = checkout;
        const git: GitStep = (command, timeout) => this.git(repoDir, command, timeout);
        const patchFile = path.join(tempDir, 'template.patch');
        const outcome = await applyTemplateChangeSince(git, { base, preserveFiles, patchFile });

        switch (outcome.kind) {
            case 'not-in-template':
                return failure('merge', notInTemplateHistory(base, target));
            case 'failed':
                return failure('merge', `The template update could not be applied: ${outcome.reason}.`);
            case 'conflicts': {
                // The SC's repo stays exactly as it was: nothing pushed, the files named.
                const { conflicts, restored } = outcome;
                const note = restored ? '' : ' (temp clone not restored)';
                const count = conflicts.length;
                this.logger.warn(`[TemplateSync] Merge conflicts in ${count} file(s); not pushing${note}`);
                return { ...failure('merge', describeTemplateConflicts(conflicts)), conflicts };
            }
            case 'unchanged':
                this.logger.info(`[TemplateSync] No template change to apply`);
                return { success: true, strategy: 'merge', syncedCommit: outcome.templateHead };
        }

        await this.restorePreservedFiles(repoDir, checkout.backups);
        await this.commitAndPush(repoDir, 'chore: sync with template', 'git push origin main');

        this.logger.info(`[TemplateSync] Merge completed successfully`);
        return { success: true, strategy: 'merge', syncedCommit: outcome.templateHead };
    }

    /** Reset the checkout to the template's content, keeping the preserved files; force-push. */
    private async performReset(checkout: Checkout): Promise<TemplateSyncResult> {
        const { repoDir, backups } = checkout;
        const git: GitStep = (command, timeout) => this.git(repoDir, command, timeout);
        const templateHead = await readTemplateHead(git);

        this.logger.debug(`[TemplateSync] Resetting to template content...`);
        const readTreeResult = await this.git(
            repoDir, `git read-tree --reset -u template/main`, TIMEOUTS.NORMAL,
        );
        if (readTreeResult.code !== 0) {
            throw new Error(`Failed to read template tree: ${readTreeResult.stderr}`);
        }

        await this.restorePreservedFiles(repoDir, backups);
        // Force: a reset may rewrite history.
        await this.commitAndPush(
            repoDir, 'chore: sync with template (reset)', 'git push origin main --force',
        );

        this.logger.info(`[TemplateSync] Reset completed successfully`);
        return { success: true, strategy: 'reset', syncedCommit: templateHead };
    }

    /** Stage everything, commit when anything is staged, and push. */
    private async commitAndPush(
        repoDir: string,
        message: string,
        pushCommand: string,
    ): Promise<void> {
        const staged = await this.git(repoDir, `git add -A`, TIMEOUTS.QUICK);
        if (staged.code !== 0) {
            throw new Error(`Failed to stage changes: ${staged.stderr}`);
        }

        const statusResult = await this.git(repoDir, `git status --porcelain`, TIMEOUTS.QUICK);
        if (statusResult.stdout.trim()) {
            const commit = `git commit -m "${message}"`;
            const commitResult = await this.git(repoDir, commit, TIMEOUTS.QUICK);
            if (commitResult.code !== 0) {
                throw new Error(`Failed to commit: ${commitResult.stderr}`);
            }
        }

        this.logger.debug(`[TemplateSync] Pushing to origin...`);
        const pushResult = await this.git(repoDir, pushCommand, TIMEOUTS.LONG);
        if (pushResult.code !== 0) {
            throw new Error(`Failed to push: ${pushResult.stderr}`);
        }
    }

    /** Backup preserved files before sync */
    private async backupPreservedFiles(
        repoDir: string,
        preserveFiles: string[],
    ): Promise<Map<string, string>> {
        const backups = new Map<string, string>();

        for (const filePath of preserveFiles) {
            const fullPath = path.join(repoDir, filePath);
            try {
                const content = await fs.readFile(fullPath, 'utf-8');
                backups.set(filePath, content);
                this.logger.debug(`[TemplateSync] Backed up ${filePath}`);
            } catch {
                // File doesn't exist - that's okay, skip it
                this.logger.debug(`[TemplateSync] File ${filePath} not found, skipping backup`);
            }
        }

        return backups;
    }

    /** Restore preserved files after sync */
    private async restorePreservedFiles(
        repoDir: string,
        backups: Map<string, string>,
    ): Promise<void> {
        for (const [filePath, content] of backups) {
            const fullPath = path.join(repoDir, filePath);
            try {
                // Ensure directory exists
                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                await fs.writeFile(fullPath, content, 'utf-8');
                this.logger.debug(`[TemplateSync] Restored ${filePath}`);
            } catch (error) {
                this.logger.warn(`[TemplateSync] Failed to restore ${filePath}: ${(error as Error).message}`);
            }
        }
    }

    /**
     * Update the project's lastSyncedCommit after successful sync
     *
     * @param project - Project to update
     * @param commitSha - New commit SHA to save
     * @param stateManager - State manager for persistence
     */
    async updateLastSyncedCommit(
        project: Project,
        commitSha: string,
        stateManager: { saveProject: (project: Project) => Promise<void> },
    ): Promise<void> {
        const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
        if (!edsInstance?.metadata) {
            this.logger.warn('[TemplateSync] Cannot update lastSyncedCommit - no EDS metadata');
            return;
        }

        const metadata = edsInstance.metadata as Record<string, unknown>;
        metadata.lastSyncedCommit = commitSha;

        await stateManager.saveProject(project);
        this.logger.info(`[TemplateSync] Updated lastSyncedCommit to ${commitSha.substring(0, 7)}`);
    }
}
