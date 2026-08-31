/**
 * Authoring-experience flip side-effects (shared service).
 *
 * Consolidates the THREE network-bound DA.live side-effects that make a project's
 * live storefront match a newly-selected AEM authoring experience:
 *   1. editor.path re-apply  — ALWAYS (both experiences)
 *   2. Quick Edit vendoring  — Experience Workspace only
 *   3. config.json regen     — Experience Workspace only
 *
 * These were previously PRIVATE on ConfigureCommand; they now live here so both
 * the Configure save path and the EW settings-change listener re-apply them
 * identically. Every step is individually NON-FATAL: a failure is logged and
 * swallowed so the authoring-experience metadata write (already persisted by the
 * caller) always stands.
 *
 * @module features/eds/services/authoringExperienceFlip
 */

import * as vscode from 'vscode';
import type { HelixCodePreview } from './helix/helixCapabilities';
import { applyDaLiveOrgConfigSettings, getDaLiveAuthService } from '../handlers/edsHelpers';
import {
    DaLiveContentOperations,
    createDaLiveServiceTokenProvider,
} from './daLive/daLiveContentOperations';
import { GitHubFileOperations } from './github/githubFileOperations';
import { GitHubTokenService } from './github/githubTokenService';
import { HelixService } from './helix/helixService';
import { installQuickEdit } from './quickEditPublisher';
import { republishStorefrontConfig } from './storefront/storefrontRepublishService';
import { COMPONENT_IDS } from '@/core/constants';
import type { AuthoringExperience, Project } from '@/types';
import type { Logger } from '@/types/logger';

/**
 * Per-step outcome. `'skipped'` means the step does not run for the given
 * experience (Quick Edit + config.json regen are Experience-Workspace-only).
 * `'warn'` means the step ran but failed (caught / `!success`); `'ok'` means it
 * succeeded (or no-op'd because its inputs were absent).
 */
export type FlipStepResult = 'ok' | 'warn' | 'skipped';

export interface FlipResult {
    /** editor.path re-apply — always runs. */
    editorPath: 'ok' | 'warn';
    /** Quick Edit vendoring — Experience Workspace only. */
    quickEdit: FlipStepResult;
    /** config.json regeneration — Experience Workspace only. */
    configRegen: FlipStepResult;
}

export interface AuthoringExperienceFlipDeps {
    context: vscode.ExtensionContext;
    logger: Logger;
    /**
     * Persist the project after a config republish clears its stale flag.
     * Required by `republishStorefrontConfig` — see that param's docblock for
     * why the save cannot be left to the caller's discretion.
     */
    saveProject: (project: Project) => Promise<void>;
    /**
     * Helix seam. Defaults to a service built from this call's logger and the
     * credentials resolved beside it; production never passes it.
     *
     * HelixService is stateless, so ADR-015 leaves the construction where it is — the
     * cost was test design. This suite could only reach `previewCode` by mocking the
     * module (ADR-016's wall), which also meant it could not say WHICH service the
     * publish went through.
     */
    helixService?: HelixCodePreview;
}

/**
 * Apply the authoring-experience DA side-effects for a project.
 *
 * Ordering (mirrors Configure's former applyAuthoringSideEffects): editor.path
 * ALWAYS; then, only when `experience === 'experience-workspace'`, Quick Edit
 * vendoring THEN config.json regeneration. Never throws — each step is non-fatal.
 */
export async function applyAuthoringExperienceFlip(
    project: Project,
    experience: AuthoringExperience,
    deps: AuthoringExperienceFlipDeps,
): Promise<FlipResult> {
    const editorPath = await reapplyEditorPath(project, experience, deps);

    let quickEdit: FlipStepResult = 'skipped';
    let configRegen: FlipStepResult = 'skipped';
    if (experience === 'experience-workspace') {
        quickEdit = await ensureQuickEditVendored(project, deps);
        configRegen = await regenerateStorefrontConfig(project, deps);
    }

    return { editorPath, quickEdit, configRegen };
}

/**
 * Re-apply the site-scoped DA.live editor.path so the punch-out matches the
 * active authoring experience. Non-fatal: logs a warning on failure and never
 * throws (the metadata write already stands). A missing DA org/site is a no-op.
 */
async function reapplyEditorPath(
    project: Project,
    experience: AuthoringExperience,
    { context, logger }: AuthoringExperienceFlipDeps,
): Promise<'ok' | 'warn'> {
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const daLiveOrg = edsInstance?.metadata?.daLiveOrg as string | undefined;
    const daLiveSite = edsInstance?.metadata?.daLiveSite as string | undefined;
    if (!daLiveOrg || !daLiveSite) {
        return 'ok';
    }

    try {
        const daLiveAuthService = getDaLiveAuthService(context);
        const tokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);
        const daLiveContentOps = new DaLiveContentOperations(tokenProvider, logger);
        await applyDaLiveOrgConfigSettings(
            daLiveContentOps,
            daLiveOrg,
            daLiveSite,
            logger,
            experience,
        );
        return 'ok';
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
            `[Configure] editor.path re-apply failed (authoring experience still saved): ${message}`,
        );
        return 'warn';
    }
}

/**
 * Vendor the Quick Edit wiring into the storefront repo so the Experience
 * Workspace Layout/WYSIWYG view has its repo-side dependency, then preview the
 * committed code so it goes live immediately. Idempotent (installQuickEdit
 * no-ops without a commit when already transformed). Non-fatal: any failure is
 * logged and swallowed. A missing/malformed githubRepo is a no-op.
 */
async function ensureQuickEditVendored(
    project: Project,
    { context, logger, helixService: injectedHelix }: AuthoringExperienceFlipDeps,
): Promise<'ok' | 'warn'> {
    try {
        const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
        const githubRepo = edsInstance?.metadata?.githubRepo as string | undefined;
        if (!githubRepo) {
            return 'ok';
        }

        // githubRepo is already "owner/repo" — a simple split is sufficient.
        const [repoOwner, repoName] = githubRepo.split('/');
        if (!repoOwner || !repoName) {
            return 'ok';
        }

        const githubTokenService = new GitHubTokenService(context.secrets, logger);
        const githubFileOps = new GitHubFileOperations(githubTokenService, logger);
        await installQuickEdit(githubFileOps, repoOwner, repoName, logger);

        // Push the committed Quick Edit code live so the Experience Workspace
        // Layout (WYSIWYG) view works immediately, without a full reset.
        const daLiveTokenProvider = createDaLiveServiceTokenProvider(getDaLiveAuthService(context));
        const helixService =
            injectedHelix ?? new HelixService(logger, githubTokenService, daLiveTokenProvider);
        await helixService.previewCode(repoOwner, repoName, '/*');
        return 'ok';
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
            `[Configure] Quick Edit vendoring failed (authoring experience still saved): ${message}`,
        );
        return 'warn';
    }
}

/**
 * Regenerate the storefront's config.json so it includes the `quick-edit`
 * Sidekick plugin the Experience Workspace canvas reads from the repo. Non-fatal:
 * logs a warning on `!success` or on a thrown error and never throws.
 */
async function regenerateStorefrontConfig(
    project: Project,
    { context, logger, saveProject }: AuthoringExperienceFlipDeps,
): Promise<'ok' | 'warn'> {
    try {
        const result = await republishStorefrontConfig({
            project,
            secrets: context.secrets,
            logger,
            persist: saveProject,
        });
        if (!result.success) {
            logger.warn(
                `[Configure] config.json regeneration warning (authoring experience still saved): ${result.error}`,
            );
            return 'warn';
        }
        return 'ok';
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
            `[Configure] config.json regeneration failed (authoring experience still saved): ${message}`,
        );
        return 'warn';
    }
}
