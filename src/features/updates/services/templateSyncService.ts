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
 * Branches: the SC's repo is `main` unless the caller names another, and the
 * template is `main` unless the storefront records a `templateBranch` (an added
 * demo's source may use another). The template branch is always fetched into
 * `template/main`, so every later step names one ref.
 */

import * as path from 'path';
import type * as vscode from 'vscode';
import { COMPONENT_IDS } from '@/core/constants';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { readLkgSha } from '@/features/eds/services/patches/lkgReader';
import { restorePreservedFiles } from '@/features/updates/services/preservedFiles';
import { commitAndPush, withCheckout, type SyncDeps } from '@/features/updates/services/templateCheckout';
import {
    applyTemplateChangeSince,
    readTemplateHead,
    type GitStep,
} from '@/features/updates/services/templateMergeBase';
import {
    COMMIT_SHA,
    DEFAULT_PRESERVE_FILES,
    describeTemplateConflicts,
    failure,
    NO_RECORDED_VERSION,
    notInTemplateHistory,
} from '@/features/updates/services/templateSyncMessages';
import { TemplateSyncStepError } from '@/features/updates/services/templateSyncStepError';
import type {
    Checkout,
    TemplateSyncOptions,
    TemplateSyncResult,
    TemplateSyncTarget,
} from '@/features/updates/services/templateSyncTypes';
import {
    lkgSourceOf,
    patchesNotPutBack,
    reapplyPatchesInCheckout,
    restoreDemoBuilderPieces,
    TESTED_VERSION_UNREADABLE,
    THIN_LAYER_RESET_REFUSED,
} from '@/features/updates/services/thinLayerUpdate';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

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

    /** What the shared checkout needs from this service. */
    private get deps(): SyncDeps {
        return {
            git: (cwd, command, timeout) => this.git(cwd, command, timeout),
            logger: this.logger,
            secrets: this.secrets,
        };
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

        const templateBranch = typeof metadata.templateBranch === 'string' ? metadata.templateBranch : undefined;
        const target: TemplateSyncTarget = {
            repoOwner, repoName, templateOwner, templateRepo, ...(templateBranch ? { templateBranch } : {}),
        };
        const preserveFiles = [...DEFAULT_PRESERVE_FILES, ...(options.preserveFiles ?? [])];

        // A thin-layer storefront (ADR-006) is the tested boilerplate plus Demo Builder's
        // fixes; resetting it to the bare template would drop the fixes (EDS-51).
        const lkgSource = lkgSourceOf(metadata);
        if (options.strategy === 'reset') {
            if (lkgSource) return failure('reset', THIN_LAYER_RESET_REFUSED);
            return this.resetRepository(target, preserveFiles);
        }

        // The base of the merge: the template version the storefront last matched.
        const base = metadata.lastSyncedCommit;
        if (typeof base !== 'string' || !COMMIT_SHA.test(base)) {
            return failure('merge', NO_RECORDED_VERSION);
        }
        // A thin-layer storefront goes to the TESTED version, never Adobe's latest,
        // which nothing has checked against its fixes (EDS-51).
        const tested = lkgSource ? await readLkgSha(lkgSource, this.logger) : undefined;
        if (lkgSource && !tested) return failure('merge', TESTED_VERSION_UNREADABLE);
        const merged = await withCheckout(this.deps, 'merge', target, preserveFiles, (checkout) =>
            this.mergeFromBase(checkout, target, { base, tested, preserveFiles }, project),
        );
        if (!merged.success || !tested) return merged;
        const { fileOperations } = getGitHubServices(this.secrets);
        const pieces = await restoreDemoBuilderPieces(project, fileOperations, this.logger);
        if (pieces.length === 0) return merged;
        return { ...merged, notes: [...(merged.notes ?? []), ...pieces] };
    }

    /**
     * Replace a repository's content with its template's, keeping `preserveFiles`,
     * and force-push. Needs no project: storefront setup calls it for an existing
     * repository the SC chose to reset, a new repository started from an added demo,
     * and `syncWithTemplate` for a project's reset.
     */
    async resetRepository(
        target: TemplateSyncTarget,
        preserveFiles: string[] = [],
        commitMessage = 'chore: sync with template (reset)',
    ): Promise<TemplateSyncResult> {
        return withCheckout(this.deps, 'reset', target, preserveFiles, (checkout) =>
            this.performReset(checkout, commitMessage),
        );
    }

    /** Run one git step in `cwd` with the shared shell. */
    private git(cwd: string, command: string, timeout: number) {
        return this.commandManager.execute(command, { cwd, timeout, shell: DEFAULT_SHELL });
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
        target: TemplateSyncTarget,
        versions: { base: string; tested?: string; preserveFiles: string[] },
        project: Project,
    ): Promise<TemplateSyncResult> {
        const { tempDir, repoDir } = checkout;
        const { base, tested, preserveFiles } = versions;
        const git: GitStep = (command, timeout) => this.git(repoDir, command, timeout);
        const patchFile = path.join(tempDir, 'template.patch');
        const outcome = await applyTemplateChangeSince(git, {
            base,
            preserveFiles,
            patchFile,
            ...(tested ? { target: tested } : {}),
        });

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

        await restorePreservedFiles(repoDir, checkout.backups, this.logger);
        // A thin-layer storefront's fixes ride in the same commit as the update.
        const patched = tested ? await reapplyPatchesInCheckout(repoDir, project, this.logger) : [];
        await commitAndPush(this.deps, repoDir, 'chore: sync with template', `git push origin ${checkout.branch}`);

        this.logger.info(`[TemplateSync] Merge completed successfully`);
        const notes = patchesNotPutBack(patched);
        return {
            success: true,
            strategy: 'merge',
            syncedCommit: outcome.templateHead,
            ...(notes.length ? { notes } : {}),
        };
    }

    /** Reset the checkout to the template's content, keeping the preserved files; force-push. */
    private async performReset(checkout: Checkout, commitMessage: string): Promise<TemplateSyncResult> {
        const { repoDir, backups, branch } = checkout;
        const git: GitStep = (command, timeout) => this.git(repoDir, command, timeout);
        const templateHead = await readTemplateHead(git);

        this.logger.debug(`[TemplateSync] Resetting to template content`);
        const readTreeResult = await this.git(
            repoDir, `git read-tree --reset -u template/main`, TIMEOUTS.NORMAL,
        );
        if (readTreeResult.code !== 0) {
            throw new TemplateSyncStepError("Could not read the template's files.", readTreeResult.stderr);
        }

        await restorePreservedFiles(repoDir, backups, this.logger);
        // Force: a reset may rewrite history.
        await commitAndPush(this.deps, repoDir, commitMessage, `git push origin ${branch} --force`);

        this.logger.info(`[TemplateSync] Reset completed successfully`);
        return { success: true, strategy: 'reset', syncedCommit: templateHead };
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
