/**
 * Headless update-apply service.
 *
 * The `perform*` functions in `commands/updateExecutor.ts` drive updates from the
 * QuickPick command — they own the UI shell (running-demo prompts, progress
 * notifications, summary toasts). This module is the modal-free counterpart used
 * by the MCP `apply_updates` tool: it computes what's available for a project and
 * applies it, returning structured per-category results instead of showing UI.
 *
 * The substantive work lives in shared services (ForkSyncService, TemplateSync-
 * Service, ComponentUpdater, ...) and — for the snapshot/marker-bearing block
 * library logic — in `applyBlockLibraryUpdateResolved`, which both paths call.
 * The only thing that diverges here is the thin per-item loop + result shaping.
 *
 * Headless block-library policy: when `demoBuilder.blockLibraries.syncBehavior`
 * is `ask` (which would prompt in the UI), this resolves to the SAFE `disabled`
 * action — it records the upstream marker without overwriting local edits, and
 * reports the library as deferred. Set the behavior to `enabled` to apply.
 */

import * as vscode from 'vscode';
import { COMPONENT_IDS } from '@/core/constants';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils';
import { sanitizeErrorForLogging } from '@/core/validation';
import { generateAIContextFiles } from '@/features/project-creation/services';
import {
    applyBlockLibraryUpdateResolved,
    updateCommitShaWithRollback,
    type UpdateContext,
} from '@/features/updates/commands/updateExecutor';
import { getTemplateSource, shouldSkipBlockLibrary } from '@/features/updates/commands/updateTypes';
import { AddonUpdateChecker } from '@/features/updates/services/addonUpdateChecker';
import { AdobeMcpUpdateChecker } from '@/features/updates/services/adobeMcpUpdateChecker';
import { ComponentUpdater } from '@/features/updates/services/componentUpdater';
import { ForkSyncService } from '@/features/updates/services/forkSyncService';
import { defaultSyncStrategyForProject } from '@/features/updates/services/syncStrategy';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import { TemplateUpdateChecker } from '@/features/updates/services/templateUpdateChecker';
import { UpdateManager } from '@/features/updates/services/updateManager';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import type { HandlerContext } from '@/types/handlers';
import { DEFAULT_SHELL } from '@/types/shell';

// ==========================================================
// Types
// ==========================================================

/** Minimal, UI-free selection fields each apply core needs. */
export interface UpdateSelections {
    forkSync: Array<{ owner: string; repo: string; branch: string }>;
    template: Array<{ project: Project }>;
    component: Array<{ project: Project; componentId: string; latestVersion: string; downloadUrl?: string }>;
    adobeMcp: Array<{ project: Project; packageName: string; latestVersion: string }>;
    blockLibrary: Array<{ project: Project; library: InstalledBlockLibrary; latestCommit: string }>;
    inspector: Array<{ project: Project; latestCommit: string }>;
}

/** Per-category outcome. */
export interface CategoryResult {
    successCount: number;
    failCount: number;
    /** Human-readable per-item failures (sanitized). */
    errors: string[];
    /** Block libraries deferred under the headless 'ask' → 'disabled' policy. */
    deferred?: string[];
}

/** Aggregate outcome across all categories. */
export interface ApplyUpdatesResult {
    forkSync: CategoryResult;
    template: CategoryResult;
    component: CategoryResult;
    adobeMcp: CategoryResult;
    addon: CategoryResult;
    totalApplied: number;
    totalFailed: number;
}

type OnProgress = (message: string) => void;

function emptyResult(): CategoryResult {
    return { successCount: 0, failCount: 0, errors: [] };
}

// ==========================================================
// Per-category apply cores (modal-free)
// ==========================================================

async function applyForkSync(
    items: UpdateSelections['forkSync'],
    ctx: UpdateContext,
    onProgress?: OnProgress,
): Promise<CategoryResult> {
    const result = emptyResult();
    if (items.length === 0) return result;
    const svc = new ForkSyncService(ctx.secrets, ctx.logger);
    for (const item of items) {
        onProgress?.(`Syncing fork ${item.owner}/${item.repo}...`);
        try {
            const r = await svc.syncFork(item.owner, item.repo, item.branch);
            if (r.success) {
                result.successCount++;
                ctx.logger.info(`[Updates] Fork synced: ${item.owner}/${item.repo}`);
            } else {
                result.failCount++;
                result.errors.push(
                    `${item.owner}/${item.repo}: ${r.conflict ? 'diverged from upstream (cannot fast-forward)' : r.message || 'sync failed'}`,
                );
            }
        } catch (error) {
            result.failCount++;
            result.errors.push(`${item.owner}/${item.repo}: ${sanitizeErrorForLogging(error as Error)}`);
            ctx.logger.error(`[Updates] Fork sync error: ${item.owner}/${item.repo}`, error as Error);
        }
    }
    return result;
}

async function applyTemplate(
    items: UpdateSelections['template'],
    ctx: UpdateContext,
    onProgress?: OnProgress,
): Promise<{ result: CategoryResult; succeededPaths: Set<string> }> {
    const result = emptyResult();
    const succeededPaths = new Set<string>();
    if (items.length === 0) return { result, succeededPaths };
    const svc = new TemplateSyncService(ctx.secrets, ctx.logger);
    for (const { project } of items) {
        onProgress?.(`Syncing template for ${project.name}...`);
        try {
            const r = await svc.syncWithTemplate(project, { strategy: defaultSyncStrategyForProject(project) });
            if (r.success) {
                await svc.updateLastSyncedCommit(project, r.syncedCommit, ctx.stateManager);
                succeededPaths.add(project.path);
                result.successCount++;
                ctx.logger.info(`[Updates] Template synced for ${project.name} (${r.strategy}${r.fallbackOccurred ? ', fallback' : ''})`);
            } else {
                throw new Error(r.error || 'Unknown error');
            }
        } catch (error) {
            result.failCount++;
            result.errors.push(`${project.name}: ${sanitizeErrorForLogging(error as Error)}`);
            ctx.logger.error(`[Updates] Template sync failed for ${project.name}`, error as Error);
        }
    }
    return { result, succeededPaths };
}

async function applyComponents(
    items: UpdateSelections['component'],
    ctx: UpdateContext,
    onProgress?: OnProgress,
): Promise<CategoryResult> {
    const result = emptyResult();
    if (items.length === 0) return result;

    // Group by project so we save once per project (mirrors performComponentUpdates).
    const byProject = new Map<string, { project: Project; items: UpdateSelections['component'] }>();
    for (const item of items) {
        const entry = byProject.get(item.project.path) ?? { project: item.project, items: [] };
        entry.items.push(item);
        byProject.set(item.project.path, entry);
    }

    const updater = new ComponentUpdater(ctx.logger, ctx.extensionPath);
    for (const { project, items: updates } of byProject.values()) {
        for (const update of updates) {
            if (!update.downloadUrl) continue;
            onProgress?.(`Updating ${update.componentId} in ${project.name}...`);
            try {
                await updater.updateComponent(project, update.componentId, update.downloadUrl, update.latestVersion);
                result.successCount++;
                ctx.logger.info(`[Updates] Updated ${update.componentId} in ${project.name}`);
            } catch (error) {
                result.failCount++;
                result.errors.push(`${update.componentId} in ${project.name}: ${sanitizeErrorForLogging(error as Error)}`);
                ctx.logger.error(`[Updates] Failed to update ${update.componentId} in ${project.name}`, error as Error);
            }
        }
        await ctx.stateManager.saveProject(project);
    }
    return result;
}

async function applyAdobeMcp(
    items: UpdateSelections['adobeMcp'],
    ctx: UpdateContext,
    onProgress?: OnProgress,
): Promise<CategoryResult> {
    const result = emptyResult();
    if (items.length === 0) return result;
    const commandManager = ServiceLocator.getCommandExecutor();
    for (const { project, packageName, latestVersion } of items) {
        const storefrontPath = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.path;
        if (!storefrontPath) {
            result.failCount++;
            result.errors.push(`${project.name}: no storefront path for Adobe MCP update`);
            continue;
        }
        onProgress?.(`Updating ${packageName} → ${latestVersion} in ${project.name}...`);
        try {
            const r = await commandManager.execute(`npm update ${packageName} --no-fund`, {
                cwd: storefrontPath,
                timeout: TIMEOUTS.VERY_LONG,
                shell: DEFAULT_SHELL,
                enhancePath: true,
            });
            if (r.code !== 0) {
                throw new Error(`npm update failed: ${r.stderr || r.stdout}`);
            }
            await generateAIContextFiles(project.path, project, ctx.extensionPath);
            result.successCount++;
            ctx.logger.info(`[Updates] Updated ${packageName} in ${project.name} → ${latestVersion}`);
        } catch (error) {
            result.failCount++;
            result.errors.push(`${project.name}: ${sanitizeErrorForLogging(error as Error)}`);
            ctx.logger.error(`[Updates] Failed to update ${packageName} in ${project.name}`, error as Error);
        }
    }
    return result;
}

async function applyAddons(
    blockLibraries: UpdateSelections['blockLibrary'],
    inspector: UpdateSelections['inspector'],
    succeededTemplatePaths: Set<string>,
    ctx: UpdateContext,
    onProgress?: OnProgress,
): Promise<CategoryResult> {
    const result = emptyResult();

    // Headless 'ask' → safe 'disabled' (record marker; do not overwrite local edits).
    const setting = vscode.workspace
        .getConfiguration('demoBuilder.blockLibraries')
        .get<'ask' | 'enabled' | 'disabled'>('syncBehavior', 'ask');
    const effectiveBehavior: 'enabled' | 'disabled' = setting === 'enabled' ? 'enabled' : 'disabled';

    for (const item of blockLibraries) {
        if (shouldSkipBlockLibrary(item.library, item.project, succeededTemplatePaths)) {
            ctx.logger.info(`[Updates] Add-on dedup: skipping "${item.library.name}" — covered by template sync`);
            continue;
        }
        onProgress?.(`Updating block library ${item.library.name}...`);
        try {
            await applyBlockLibraryUpdateResolved(item, effectiveBehavior, ctx);
            if (effectiveBehavior === 'disabled' && setting === 'ask') {
                (result.deferred ??= []).push(item.library.name);
            } else {
                result.successCount++;
            }
        } catch (error) {
            result.failCount++;
            result.errors.push(`${item.library.name}: ${sanitizeErrorForLogging(error as Error)}`);
            ctx.logger.error(`[Updates] Failed to update block library "${item.library.name}"`, error as Error);
        }
    }

    for (const item of inspector) {
        onProgress?.(`Updating Inspector SDK in ${item.project.name}...`);
        try {
            await updateCommitShaWithRollback(
                item.project.installedInspectorSdk,
                item.latestCommit,
                () => ctx.stateManager.saveProject(item.project),
            );
            result.successCount++;
            ctx.logger.info(`[Updates] Updated Inspector SDK in ${item.project.name}`);
        } catch (error) {
            result.failCount++;
            result.errors.push(`Inspector SDK in ${item.project.name}: ${sanitizeErrorForLogging(error as Error)}`);
            ctx.logger.error(`[Updates] Failed to update Inspector SDK in ${item.project.name}`, error as Error);
        }
    }

    return result;
}

// ==========================================================
// Orchestrator
// ==========================================================

/**
 * Apply all selected updates headlessly, in the same category order the QuickPick
 * command uses (fork → template → components → Adobe MCP → add-ons), threading
 * template-sync successes into the add-on dedup.
 */
export async function applyUpdatesHeadless(
    selections: UpdateSelections,
    ctx: UpdateContext,
    onProgress?: OnProgress,
): Promise<ApplyUpdatesResult> {
    const forkSync = await applyForkSync(selections.forkSync, ctx, onProgress);
    const { result: template, succeededPaths } = await applyTemplate(selections.template, ctx, onProgress);
    const component = await applyComponents(selections.component, ctx, onProgress);
    const adobeMcp = await applyAdobeMcp(selections.adobeMcp, ctx, onProgress);
    const addon = await applyAddons(selections.blockLibrary, selections.inspector, succeededPaths, ctx, onProgress);

    const cats = [forkSync, template, component, adobeMcp, addon];
    return {
        forkSync,
        template,
        component,
        adobeMcp,
        addon,
        totalApplied: cats.reduce((s, c) => s + c.successCount, 0),
        totalFailed: cats.reduce((s, c) => s + c.failCount, 0),
    };
}

// ==========================================================
// Selection computation (single project)
// ==========================================================

/**
 * Compute available updates for ONE project across all categories, reusing the
 * same checker services the QuickPick command uses. Each category degrades
 * independently — a checker failure logs and yields an empty list rather than
 * aborting the whole computation.
 */
export async function computeProjectUpdateSelections(
    project: Project,
    handlerCtx: HandlerContext,
): Promise<UpdateSelections> {
    const { secrets } = handlerCtx.context;
    const logger = handlerCtx.logger;
    const selections: UpdateSelections = {
        forkSync: [],
        template: [],
        component: [],
        adobeMcp: [],
        blockLibrary: [],
        inspector: [],
    };

    // Fork sync
    try {
        const source = getTemplateSource(project);
        if (source) {
            const status = await new ForkSyncService(secrets, logger).checkForkStatus(source.owner, source.repo);
            if (status?.isFork && status.behindBy > 0) {
                selections.forkSync.push({ owner: source.owner, repo: source.repo, branch: status.defaultBranch || 'main' });
            }
        }
    } catch (error) {
        logger.warn(`[Updates] Fork sync check failed: ${sanitizeErrorForLogging(error as Error)}`);
    }

    // Template
    try {
        const t = await new TemplateUpdateChecker(secrets, logger).checkForUpdates(project);
        if (t?.hasUpdates) selections.template.push({ project });
    } catch (error) {
        logger.warn(`[Updates] Template check failed: ${sanitizeErrorForLogging(error as Error)}`);
    }

    // Components
    try {
        const results = await new UpdateManager(handlerCtx.context, logger).checkAllProjectsForUpdates([project]);
        for (const r of results) {
            const outdated = r.outdatedProjects.some((o) => o.project.path === project.path);
            if (outdated && r.releaseInfo?.downloadUrl) {
                selections.component.push({
                    project,
                    componentId: r.componentId,
                    latestVersion: r.latestVersion,
                    downloadUrl: r.releaseInfo.downloadUrl,
                });
            }
        }
    } catch (error) {
        logger.warn(`[Updates] Component check failed: ${sanitizeErrorForLogging(error as Error)}`);
    }

    // Adobe MCP
    try {
        const a = await new AdobeMcpUpdateChecker(secrets, logger).checkForUpdates(project);
        if (a?.hasUpdate) selections.adobeMcp.push({ project, packageName: a.packageName, latestVersion: a.latestVersion });
    } catch (error) {
        logger.warn(`[Updates] Adobe MCP check failed: ${sanitizeErrorForLogging(error as Error)}`);
    }

    // Add-ons (block libraries + inspector)
    try {
        const checker = new AddonUpdateChecker(secrets, logger);
        for (const u of await checker.checkBlockLibraries(project)) {
            selections.blockLibrary.push({ project, library: u.library, latestCommit: u.latestCommit });
        }
        const insp = await checker.checkInspectorSdk(project);
        if (insp?.hasUpdate) selections.inspector.push({ project, latestCommit: insp.latestCommit });
    } catch (error) {
        logger.warn(`[Updates] Add-on check failed: ${sanitizeErrorForLogging(error as Error)}`);
    }

    return selections;
}

/** Total number of pending updates across a selection set. */
export function countSelections(selections: UpdateSelections): number {
    return (
        selections.forkSync.length +
        selections.template.length +
        selections.component.length +
        selections.adobeMcp.length +
        selections.blockLibrary.length +
        selections.inspector.length
    );
}
