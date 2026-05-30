/**
 * apply_updates (Phase 4) — check and apply available updates for the current
 * project across all categories (fork sync, template, components, Adobe MCP,
 * block libraries, inspector SDK), via the headless updateApplyService.
 *
 * Two modes in one tool:
 *  - WITHOUT confirm: read-only — reports what's available (acts as the check).
 *  - WITH confirm:true: applies everything available, returning per-category
 *    counts + a phase timeline.
 *
 * It refuses to apply while the demo is running (the headless path won't stop it,
 * unlike the QuickPick command's prompt). Block libraries on the 'ask' sync
 * behavior are deferred to the safe 'disabled' action — see updateApplyService.
 */

import { z } from 'zod';
import type { StateManager } from '@/core/state';
import {
    applyUpdatesHeadless,
    computeProjectUpdateSelections,
    countSelections,
    type UpdateSelections,
} from '@/features/updates/services/updateApplyService';
import type { HandlerContext } from '@/types/handlers';

/** Wrap a JSON-serializable value as an MCP text result. */
function asText(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

/** Compact, human-readable summary of pending updates. */
function summarize(selections: UpdateSelections): Record<string, unknown> {
    return {
        forkSync: selections.forkSync.map((f) => `${f.owner}/${f.repo}`),
        template: selections.template.length,
        component: selections.component.map((c) => `${c.componentId} → ${c.latestVersion}`),
        adobeMcp: selections.adobeMcp.map((a) => `${a.packageName} → ${a.latestVersion}`),
        blockLibrary: selections.blockLibrary.map((b) => b.library.name),
        inspector: selections.inspector.length,
    };
}

/**
 * Register the apply_updates tool on `server`.
 *
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext for each invocation.
 */
export function registerApplyUpdatesTool(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'apply_updates',
        {
            description:
                'Check and (with confirm:true) apply available updates for the current project — fork sync, template, components, Adobe MCP, block libraries, inspector SDK. Without confirm, reports what is available.',
            inputSchema: {
                confirm: z.boolean().optional().describe('Set true to apply; omit to only report what is available'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const ctx = ctxFactory();
            const project = await ctx.stateManager.getCurrentProject();
            if (!project) {
                return asText({ error: 'No current project is open' });
            }

            const selections = await computeProjectUpdateSelections(project, ctx);
            const available = countSelections(selections);
            const summary = summarize(selections);

            if (available === 0) {
                return asText({ upToDate: true, available: 0 });
            }

            if (args?.confirm !== true) {
                return asText({
                    available,
                    summary,
                    message: `${available} update(s) available. Call again with confirm:true to apply.`,
                });
            }

            if (project.status === 'running') {
                return asText({
                    error: 'Stop the running demo before applying updates (the headless updater will not stop it for you).',
                    available,
                    summary,
                });
            }

            const phases: string[] = [];
            const result = await applyUpdatesHeadless(
                selections,
                {
                    secrets: ctx.context.secrets,
                    extensionPath: ctx.context.extensionPath,
                    // Runtime value is the real StateManager; HandlerContext types it
                    // via the @/types/state interface, which lacks the class privates.
                    stateManager: ctx.stateManager as unknown as StateManager,
                    logger: ctx.logger,
                },
                (m) => phases.push(m),
            );

            return asText({
                applied: result.totalApplied,
                failed: result.totalFailed,
                categories: {
                    forkSync: result.forkSync,
                    template: result.template,
                    component: result.component,
                    adobeMcp: result.adobeMcp,
                    addon: result.addon,
                },
                phases,
            });
        },
    );
}
