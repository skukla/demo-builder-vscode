/**
 * The ONE Adobe-MCP update core, shared by both apply paths:
 *
 * - `performAdobeMcpUpdates` (commands/updateExecutor.ts) — the QuickPick UI
 *   shell (running-demo guard, withProgress, error toasts).
 * - `applyAdobeMcp` (services/updateApplyService.ts) — the headless MCP
 *   `apply_updates` path (structured per-item results).
 *
 * Sequence: `npm update` in the per-project ISOLATED tools dir
 * (`resolveMcpToolsDir` — never the storefront's node_modules) → regenerate
 * the AI bundle so the skill bundles re-namespace against the new version →
 * best-effort hash persist when the regenerate throws (landed hashes must
 * survive a partial failure) → WHY log naming the hash-and-skip skips →
 * freshness-stamp save.
 *
 * This lived duplicated (~40 near-identical lines) in both callers and
 * drifted twice — most expensively when the headless copy ran `npm update`
 * in the storefront path, a silent no-op that re-offered the same update
 * forever. Throws on any failure; callers own counting and surfacing.
 *
 * Lives in its own module (not updateApplyService.ts) because the apply
 * service imports from updateExecutor — hosting the core there would create
 * an import cycle between the two callers.
 */

import type { CommandExecutor } from '@/core/shell';
import type { StateManager } from '@/core/state';
import { TIMEOUTS } from '@/core/utils';
import { generateAIContextFiles, resolveMcpToolsDir } from '@/features/project-creation/services';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';

/** The slice of the callers' UpdateContext the core actually needs. */
export interface AdobeMcpUpdateCoreContext {
    extensionPath: string;
    /** The one method this core calls; UpdateContext's pick satisfies it. */
    stateManager: Pick<StateManager, 'saveProjectConfigOnly'>;
    logger: Logger;
    /** ADR-015: handed in at the boundary rather than fetched here. */
    commandManager: CommandExecutor;
}

/**
 * Update one project's Adobe MCP package and regenerate its AI bundle.
 * Throws on npm failure or (after the best-effort hash persist) on a failed
 * regenerate.
 */
export async function applyAdobeMcpUpdate(
    project: Project,
    packageName: string,
    latestVersion: string,
    ctx: AdobeMcpUpdateCoreContext,
): Promise<void> {
    const { commandManager } = ctx;
    const toolsDir = resolveMcpToolsDir(project.path);

    const result = await commandManager.execute(`npm update ${packageName} --no-fund`, {
        cwd: toolsDir,
        timeout: TIMEOUTS.VERY_LONG,
        shell: DEFAULT_SHELL,
        enhancePath: true,
    });
    if (result.code !== 0) {
        throw new Error(`npm update failed: ${result.stderr || result.stdout}`);
    }

    let generated;
    try {
        generated = await generateAIContextFiles(project.path, project, ctx.extensionPath);
    } catch (err) {
        // Landed hashes must survive a partial failure (Phase-4 review).
        try {
            await ctx.stateManager.saveProjectConfigOnly(project);
        } catch {
            /* best-effort */
        }
        throw err;
    }

    // WHY line: an npm update rewrote the isolated tools dir, so the AI
    // bundle was regenerated around it; hash-and-skip (ADR-013) leaves
    // user-edited files alone — name them so the skip is an event.
    ctx.logger.info(
        `[Updates] Regenerated AI bundle after ${packageName} npm update; ` +
            `skipped (user-edited): [${(generated?.report?.skipped ?? []).join(', ')}]`,
    );

    // Persist the freshness stamp + hashes generateAIContextFiles set on
    // `project`, else the activation sweep re-refreshes the bundle on every
    // start and the freshness log reports perpetual staleness.
    await ctx.stateManager.saveProjectConfigOnly(project);
    ctx.logger.info(`[Updates] Updated ${packageName} in ${project.name} → ${latestVersion}`);
}
