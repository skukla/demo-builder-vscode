/**
 * Experience Workspace settings-change listener.
 *
 * Watches the two VS Code settings whose value is baked into an EDS project's
 * live DA.live config (`demoBuilder.daLive.ewCanvasBranch` and
 * `demoBuilder.daLive.authoringExperience`). When either changes, it finds the
 * affected projects and — after an explicit confirm prompt — re-applies the
 * authoring-experience flip so their live storefronts match the new setting.
 *
 * Affected-project predicate (per setting):
 *  - ewCanvasBranch      → EDS projects whose resolved authoring is EW (the branch
 *                          is only baked into the EW canvas URL).
 *  - authoringExperience → EDS projects with NO per-project override (only those
 *                          follow the global default, so only they change).
 *
 * @module features/eds/services/ewSettingChangeListener
 */

import * as vscode from 'vscode';
import { resolveProjectAuthoringExperience } from '../handlers/edsHelpers';
import { applyAuthoringExperienceFlip } from './authoringExperienceFlip';
import type { GitHubTokenService } from './github/githubTokenService';
import { COMPONENT_IDS } from '@/core/constants';
import type { StateManager } from '@/core/state/stateManager';
import type { AuthoringExperience, Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { isEdsProject } from '@/types/typeGuards';

/** Coalesce rapid settings edits (e.g. multi-keystroke value changes). */
const EW_SETTING_DEBOUNCE_MS = 300;

const EW_CANVAS_BRANCH_SETTING = 'demoBuilder.daLive.ewCanvasBranch';
const AUTHORING_EXPERIENCE_SETTING = 'demoBuilder.daLive.authoringExperience';

/** Recognized authoring-experience union members (override source of truth). */
const AUTHORING_EXPERIENCES: ReadonlySet<string> = new Set<AuthoringExperience>([
    'da-live-classic',
    'experience-workspace',
]);

interface ChangeFlags {
    branchChanged: boolean;
    experienceChanged: boolean;
}

export interface EwSettingChangeListenerDeps {
    context: vscode.ExtensionContext;
    stateManager: StateManager;
    logger: Logger;
    /**
     * Passed straight through to `applyAuthoringExperienceFlip`, which needs the
     * SHARED instance — see that interface for why a fresh one costs a GitHub round
     * trip. This listener has no use for it itself.
     */
    githubTokenService: GitHubTokenService;
}

/**
 * Register the EW settings-change listener. Returns a Disposable that removes the
 * VS Code subscription and clears any pending debounce timer.
 */
export function registerEwSettingChangeListener(
    deps: EwSettingChangeListenerDeps,
): vscode.Disposable {
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingBranch = false;
    let pendingExperience = false;

    const subscription = vscode.workspace.onDidChangeConfiguration((e) => {
        const branchChanged = e.affectsConfiguration(EW_CANVAS_BRANCH_SETTING);
        const experienceChanged = e.affectsConfiguration(AUTHORING_EXPERIENCE_SETTING);
        if (!branchChanged && !experienceChanged) {
            return;
        }

        // Accumulate flags so a burst of edits touching different settings all
        // get handled together when the debounce fires.
        pendingBranch = pendingBranch || branchChanged;
        pendingExperience = pendingExperience || experienceChanged;

        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            debounceTimer = undefined;
            const flags: ChangeFlags = {
                branchChanged: pendingBranch,
                experienceChanged: pendingExperience,
            };
            pendingBranch = false;
            pendingExperience = false;
            void handleEwSettingChange(deps, flags);
        }, EW_SETTING_DEBOUNCE_MS);
    });

    return {
        dispose: () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = undefined;
            }
            subscription.dispose();
        },
    };
}

/**
 * Find the affected projects, prompt to confirm, and re-apply the flip to each
 * on confirmation. Silent (no prompt) when nothing is affected. Non-fatal per
 * project — one project's failure never aborts the rest.
 */
async function handleEwSettingChange(
    deps: EwSettingChangeListenerDeps,
    flags: ChangeFlags,
): Promise<void> {
    const { context, stateManager, logger, githubTokenService } = deps;
    try {
        const affected = await findAffectedProjects(stateManager, flags);
        if (affected.length === 0) {
            return;
        }

        const selection = await vscode.window.showInformationMessage(
            `${affected.length} project(s) affected by this Experience Workspace setting change — republish now?`,
            'Republish',
            'Not now',
        );
        if (selection !== 'Republish') {
            return;
        }

        let successCount = 0;
        for (const project of affected) {
            try {
                const experience = resolveProjectAuthoringExperience(project);
                await applyAuthoringExperienceFlip(project, experience, {
                    context,
                    logger,
                    saveProject: (p) => stateManager.saveProject(p),
                    githubTokenService,
                });
                successCount++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger.warn(`[EWSettingChange] Republish failed for ${project.name}: ${message}`);
            }
        }

        notifyCompletion(affected, successCount);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`[EWSettingChange] Failed to process setting change: ${message}`);
    }
}

/**
 * Enumerate all projects, load each in full, and keep the EDS projects that the
 * per-setting predicate marks as affected.
 */
async function findAffectedProjects(
    stateManager: StateManager,
    flags: ChangeFlags,
): Promise<Project[]> {
    const summaries = await stateManager.getAllProjects();
    const affected: Project[] = [];
    for (const summary of summaries) {
        // Load full project data to access componentInstances (persistAfterLoad:
        // false — a background read must not mutate the on-disk current project).
        const project = await stateManager.loadProjectFromPath(summary.path, () => [], {
            persistAfterLoad: false,
        });
        if (!project || !isEdsProject(project)) {
            continue;
        }
        if (isProjectAffected(project, flags)) {
            affected.push(project);
        }
    }
    return affected;
}

/**
 * Per-setting affected predicate:
 *  - ewCanvasBranch changed      → keep EW-resolved projects.
 *  - authoringExperience changed → keep projects with NO per-project override.
 */
function isProjectAffected(project: Project, flags: ChangeFlags): boolean {
    if (
        flags.branchChanged &&
        resolveProjectAuthoringExperience(project) === 'experience-workspace'
    ) {
        return true;
    }
    if (flags.experienceChanged && !hasAuthoringOverride(project)) {
        return true;
    }
    return false;
}

/**
 * A project has a per-project authoring override when its EDS metadata carries a
 * recognized `authoringExperience` value — the exact condition under which
 * `resolveAuthoringExperience` lets metadata win over the global default.
 */
function hasAuthoringOverride(project: Project): boolean {
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const metadataValue = edsInstance?.metadata?.authoringExperience as string | undefined;
    return !!metadataValue && AUTHORING_EXPERIENCES.has(metadataValue);
}

/** Toast on completion: single project names it; many report a count. */
function notifyCompletion(affected: Project[], successCount: number): void {
    if (affected.length === 1) {
        void vscode.window.showInformationMessage(
            `Re-applied Experience Workspace config to ${affected[0].name}`,
        );
        return;
    }
    void vscode.window.showInformationMessage(
        `Re-applied Experience Workspace config to ${successCount} of ${affected.length} projects`,
    );
}
