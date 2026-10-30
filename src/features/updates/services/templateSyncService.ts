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
import { COMPONENT_IDS } from '@/core/constants';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { readLkgSha } from '@/features/eds/services/patches/lkgReader';
import { prepareForAdobeChange, repairInCheckout, type AdobeChangePrep } from '@/features/updates/services/adobeChangePrep';
import type { BoilerplateBase } from '@/features/updates/services/boilerplateBase';
import { copiedDemoOf, stoppedOnClash, type CopiedDemoAt } from '@/features/updates/services/clashAttribution';
import { checkoutLabelAccess, labelsPutBack, repairStubbedLabelFiles } from '@/features/updates/services/labelStubRepair';
import { removeFilesNotBackedUp, restorePreservedFiles } from '@/features/updates/services/preservedFiles';
import { blockLibraryFolders, putBackOwnPieces } from '@/features/updates/services/setAsidePieces';
import { commitAndPush, withCheckout, type SyncDeps } from '@/features/updates/services/templateCheckout';
import {
    applyTemplateChangeSince,
    readTemplateHead,
    type GitStep,
} from '@/features/updates/services/templateMergeBase';
import {
    COMMIT_SHA,
    BOILERPLATE_COMMIT,
    DEFAULT_PRESERVE_FILES,
    LABEL_SHEET_FILES,
    TEMPLATE_COMMIT,
    failure,
    NO_RECORDED_VERSION,
    notInTemplateHistory,
} from '@/features/updates/services/templateSyncMessages';
import { TemplateSyncStepError } from '@/features/updates/services/templateSyncStepError';
import type {
    Checkout,
    GitHubAccess,
    TemplateClash,
    TemplateSyncOptions,
    TemplateSyncResult,
    TemplateSyncTarget,
} from '@/features/updates/services/templateSyncTypes';
import {
    lkgSourceOf,
    patchesNotPutBack,
    reapplyPatchesInCheckout,
    TESTED_VERSION_UNREADABLE,
    THIN_LAYER_RESET_REFUSED,
    type OverlayResolver,
} from '@/features/updates/services/thinLayerUpdate';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/** What one merge applies, and between which versions. */
interface MergeVersions {
    base: string;
    /** Adobe's tested boilerplate version: the change is Adobe's, so Demo Builder's pieces are set aside. */
    tested?: string;
    preserveFiles: string[];
    /** A thin-layer storefront: its fixes ride in the update's commit. */
    fixes: boolean;
    message?: string;
    /** On the Adobe boilerplate track: the colleague's demo, to say whose edit a clash is. */
    copiedFrom?: CopiedDemoAt;
}

/** Synchronizes an EDS project with its upstream template (see the module header). */
export class TemplateSyncService {
    /**
     * ADR-015: every dependency arrives here; nothing is fetched from a service cache.
     * The callers (commands and handlers, the boundary) pass the extension's own GitHub
     * services; the patch canary passes its own, outside VS Code (EDS-49).
     *
     * @param resolveOverlay - the product-page overlay lookup the resets use
     *   (`resolveByomOverlayConfig`); absent outside VS Code, where the project row's is used
     */
    constructor(
        private readonly github: GitHubAccess,
        private readonly logger: Logger,
        private readonly commandManager: Pick<CommandExecutor, 'execute'>,
        private readonly resolveOverlay?: OverlayResolver,
    ) {}

    /** What the shared checkout needs from this service. */
    private get deps(): SyncDeps {
        return {
            git: (cwd, command, timeout) => this.git(cwd, command, timeout),
            logger: this.logger,
            github: this.github,
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
        return withCheckout(this.deps, 'merge', target, preserveFiles, (checkout) =>
            this.mergeFromBase(checkout, target, { base, tested, preserveFiles, fixes: Boolean(tested) }, project),
        );
    }

    /**
     * Bring a colleague's storefront's Adobe half to our tested version (EDS-56): Adobe's
     * change from the recorded base to `tested`, applied 3-way onto the SC's repository,
     * the SC's and the colleague's edits kept. The storefront's own template fields belong
     * to the colleague's track, so every coordinate here is named by the caller. Demo
     * Builder's fixes are not re-applied (EDS-56 D6), and a conflict stops: no reset is
     * ever offered on this track.
     */
    async syncBoilerplate(
        project: Project,
        update: { base: BoilerplateBase; tested: string },
    ): Promise<TemplateSyncResult> {
        const metadata = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata as
            | Record<string, unknown>
            | undefined;
        const [repoOwner, repoName] = String(metadata?.githubRepo ?? '').split('/');
        if (!repoOwner || !repoName) return failure('merge', 'Missing required metadata: githubRepo');
        const { base, tested } = update;
        const target: TemplateSyncTarget = {
            repoOwner,
            repoName,
            templateOwner: base.template.owner,
            templateRepo: base.template.repo,
        };
        const preserveFiles = [...DEFAULT_PRESERVE_FILES];
        const copiedFrom = copiedDemoOf(metadata);
        return withCheckout(this.deps, 'merge', target, preserveFiles, (checkout) =>
            this.mergeFromBase(
                checkout,
                target,
                { base: base.commit, tested, preserveFiles, fixes: false, message: BOILERPLATE_COMMIT, copiedFrom },
                project,
            ),
        );
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
        // Only the label files this reset was asked to preserve are kept absent.
        const keptAbsent = LABEL_SHEET_FILES.filter((file) => preserveFiles.includes(file));
        return withCheckout(this.deps, 'reset', target, preserveFiles, (checkout) =>
            this.performReset(checkout, commitMessage, keptAbsent),
        );
    }

    /** Run one git step in `cwd` with the shared shell. */
    private git(cwd: string, command: string, timeout: number) {
        return this.commandManager.execute(command, { cwd, timeout, shell: DEFAULT_SHELL });
    }

    /**
     * Apply the template's change from the recorded `base` to its latest commit,
     * keeping the SC's own edits, then commit and push, once.
     *
     * When the change is Adobe's tested boilerplate, Demo Builder's repairs are written into
     * this clone first and its own pieces are set aside (`adobeChangePrep.ts`), then put back
     * after the apply: a clash is then somebody's edit, never ours, and a stopped update has
     * pushed nothing at all (JustRite, 2026-10-30). Block folders an installed library owns
     * are left out of every template change; the library's update keeps them current.
     *
     * A conflict means someone edited the same region the template changed. The
     * clone is restored and the files are reported; it is never turned into a
     * reset here (a user's own edits are never overwritten — CLAUDE.md, rule 2).
     */
    private async mergeFromBase(
        checkout: Checkout,
        target: TemplateSyncTarget,
        versions: MergeVersions,
        project: Project,
    ): Promise<TemplateSyncResult> {
        const { tempDir, repoDir } = checkout;
        const { base, tested, fixes } = versions;
        const git: GitStep = (command, timeout) => this.git(repoDir, command, timeout);
        const prep = tested
            ? await prepareForAdobeChange({ dir: repoDir, git, project, logger: this.logger, resolveOverlay: this.resolveOverlay })
            : undefined;
        const leftOut = [...versions.preserveFiles, ...blockLibraryFolders(project)];
        const outcome = await applyTemplateChangeSince(git, {
            base,
            preserveFiles: leftOut,
            patchFile: path.join(tempDir, 'template.patch'),
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
                this.logger.warn(`[TemplateSync] Merge conflicts in ${conflicts.length} file(s); not pushing${note}`);
                const clash: TemplateClash = {
                    source: { owner: target.templateOwner, repo: target.templateRepo },
                    base,
                    target: outcome.templateHead,
                    preserveFiles: leftOut,
                    ...(prep ? { ownPiecesAside: true } : {}),
                };
                const token = versions.copiedFrom ? (await this.github.tokenService.getToken())?.token : undefined;
                return stoppedOnClash(git, conflicts, clash, versions.copiedFrom, token);
            }
            case 'unchanged':
                return this.repairLabelsOnly(checkout, git, outcome.templateHead, versions.message, prep);
        }

        await restorePreservedFiles(repoDir, checkout.backups, this.logger);
        // Our stub over the template's labels goes, in the update's own commit.
        const labels = await repairStubbedLabelFiles(checkoutLabelAccess(repoDir, git, outcome.templateHead));
        const putBack = prep ? await putBackOwnPieces(repoDir, prep.aside) : [];
        // A thin-layer storefront's fixes ride in the same commit as the update, and its
        // repairs run again on the updated code, as they did after the push before 2026-10-30.
        const patched = fixes ? await reapplyPatchesInCheckout(repoDir, project, this.logger) : [];
        const pieces = fixes ? await repairInCheckout(repoDir, project, this.logger, this.resolveOverlay) : (prep?.lines ?? []);
        await commitAndPush(this.deps, repoDir, versions.message ?? TEMPLATE_COMMIT, `git push origin ${checkout.branch}`);

        this.logger.info(`[TemplateSync] Merge completed successfully`);
        const notes = [...labelsPutBack(labels), ...putBack, ...patchesNotPutBack(patched), ...pieces];
        return {
            success: true,
            strategy: 'merge',
            syncedCommit: outcome.templateHead,
            ...(notes.length ? { notes } : {}),
        };
    }

    /**
     * The template has nothing to apply, but a label file may still be our stub over the
     * template's labels (storefronts made before 2026-10-22), and Demo Builder's repairs may
     * have changed the clone: push those. Nothing changed pushes nothing.
     */
    private async repairLabelsOnly(
        checkout: Checkout,
        git: GitStep,
        templateHead: string,
        message = TEMPLATE_COMMIT,
        prep?: AdobeChangePrep,
    ): Promise<TemplateSyncResult> {
        const putBack = prep ? await putBackOwnPieces(checkout.repoDir, prep.aside) : [];
        const labels = await repairStubbedLabelFiles(checkoutLabelAccess(checkout.repoDir, git, templateHead));
        if (labels.length === 0 && !(prep && (await this.anythingToCommit(git)))) {
            this.logger.info(`[TemplateSync] No template change to apply`);
            const lines = [...putBack, ...(prep?.lines ?? [])];
            return { success: true, strategy: 'merge', syncedCommit: templateHead, ...(lines.length ? { notes: lines } : {}) };
        }
        await commitAndPush(this.deps, checkout.repoDir, message, `git push origin ${checkout.branch}`);
        this.logger.info(`[TemplateSync] No template change to apply; pushed: ${labels.join(', ') || "Demo Builder's repairs"}`);
        const notes = [...labelsPutBack(labels), ...putBack, ...(prep?.lines ?? [])];
        return { success: true, strategy: 'merge', syncedCommit: templateHead, ...(notes.length ? { notes } : {}) };
    }

    /** Whether the clone differs from its last commit once everything is staged. */
    private async anythingToCommit(git: GitStep): Promise<boolean> {
        await git('git add -A', TIMEOUTS.QUICK);
        return (await git('git status --porcelain', TIMEOUTS.QUICK)).stdout.trim() !== '';
    }

    /** Reset the checkout to the template's content, keeping the preserved files; force-push. */
    private async performReset(
        checkout: Checkout,
        commitMessage: string,
        keptAbsent: readonly string[],
    ): Promise<TemplateSyncResult> {
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
        await removeFilesNotBackedUp(repoDir, keptAbsent, backups, this.logger);
        // Force: a reset may rewrite history.
        await commitAndPush(this.deps, repoDir, commitMessage, `git push origin ${branch} --force`);

        this.logger.info(`[TemplateSync] Reset completed successfully`);
        return { success: true, strategy: 'reset', syncedCommit: templateHead };
    }

    /** Record `commitSha` as the template version the storefront matches, after a successful sync. */
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
