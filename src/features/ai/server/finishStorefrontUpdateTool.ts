/**
 * finish_storefront_update — finish (or leave) a storefront update whose clash was kept in
 * the project's local storefront copy for fixing (EDS-57).
 *
 * A template or Adobe boilerplate update that clashes with edits in the storefront can be
 * kept (the Updates window's "Fix with AI", or apply_updates onClash:keep): the update is
 * applied in the local copy and the clashing files carry conflict markers. The agent fixes
 * those files and calls this; the builder then checks (still the current update, only the
 * clashing files changed, no markers left, the JavaScript and JSON parse), commits, pushes
 * with the user's token and records the version. The agent never pushes itself.
 *
 * Three modes:
 *  - no confirm: read-only — the files, which still have markers, and the diff that would go live
 *  - confirm:true: finish (raises the consent dialog: it updates the live site)
 *  - confirm:true, leave:true: undo the local copy to its last commit and forget the clash
 *
 * Named by project, not the open one: Fix with AI starts on Your Projects, where the open
 * project can be any other.
 *
 * When the fix ends (finished, dropped, or dropped for a newer version) the SC is told
 * here, not left to the agent (EDS-56, owner 2026-10-30: the AI finished and the Updates
 * window still said it was working). The answer's `scNotified` is what they were shown, so
 * the agent does not send them to look. The telling is a side channel; the answer never
 * waits on it.
 */

import { z } from 'zod';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { tellFixEnded } from '@/features/updates/handlers/fixEndedNotice';
import { finishClash, leaveClash, previewClash } from '@/features/updates/services/pendingClashFinish';
import { createFinishDeps } from '@/features/updates/services/pendingClashFinishDeps';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

async function projectNamed(ctx: HandlerContext, name: string): Promise<Project | undefined> {
    const entry = (await ctx.stateManager.getAllProjects()).find((p) => p.name === name);
    if (!entry) return undefined;
    return (await ctx.stateManager.loadProjectFromPath(entry.path, undefined, { persistAfterLoad: false })) ?? undefined;
}

function updateContextOf(ctx: HandlerContext): UpdateContext {
    return {
        secrets: ctx.context.secrets,
        extensionPath: ctx.context.extensionPath,
        stateManager: ctx.stateManager,
        logger: ctx.logger,
        commandManager: ServiceLocator.getCommandExecutor(),
    };
}

/**
 * Register the finish_storefront_update tool on `server`.
 *
 * @param ctxFactory Builds a headless HandlerContext for each invocation.
 */
export function registerFinishStorefrontUpdateTool(server: McpToolServer, ctxFactory: () => HandlerContext): void {
    server.registerTool(
        'finish_storefront_update',
        {
            needsAuth: ['github'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                'Finish a storefront update that stopped on a clash and was kept in the project\'s local storefront copy '
                + '(apply_updates onClash:keep, or the Updates window\'s Fix with AI). Fix ONLY the files it names, remove '
                + 'every conflict marker keeping what both sides meant, and do not commit or push yourself: call this with '
                + 'confirm:true and Demo Builder checks the files (no markers left, JavaScript and JSON parse, nothing else '
                + 'changed), pushes one commit and records the version. Without confirm it changes nothing and returns the '
                + 'files, which still have markers, and the diff that would go live. With leave:true and confirm:true it '
                + 'drops the fix instead and puts the local copy back. Demo Builder tells the SC itself when the fix is '
                + 'finished or dropped; scNotified is what they were shown.',
            inputSchema: {
                project: z.string().describe('The project name (as get_project_status takes it)'),
                leave: z.boolean().optional().describe('Drop the fix and put the local copy back, instead of finishing'),
                confirm: z.boolean().optional().describe('Set true to finish (or leave); omit to only preview'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const ctx = ctxFactory();
            const name = String(args?.project ?? '').trim();
            const project = name ? await projectNamed(ctx, name) : undefined;
            if (!project) return asText({ error: `No project named "${name}"` });
            const updateCtx = updateContextOf(ctx);

            const preview = await previewClash(project, updateCtx);
            if (!preview) return asText({ project: name, nothingKept: true, message: 'No storefront update is waiting to be finished for this project.' });
            if (args?.confirm !== true) {
                return asText({
                    project: name,
                    ...preview,
                    message: preview.markersLeft.length
                        ? `Fix ${preview.markersLeft.join(', ')} first: conflict markers are still there.`
                        : 'Ready to finish. Call again with confirm:true; it pushes to the storefront and updates the live site.',
                });
            }
            if (args.leave === true) {
                await leaveClash(project, updateCtx);
                const scNotified = tellFixEnded(project, preview.track, 'left');
                return asText({ project: name, left: true, message: 'The fix was dropped and the local copy put back. The update is offered again.', scNotified });
            }
            const outcome = await finishClash(project, createFinishDeps(updateCtx));
            if (outcome.kind === 'finished') {
                return asText({ project: name, ...outcome, scNotified: tellFixEnded(project, preview.track, 'finished', outcome.localCopyClean) });
            }
            if (outcome.kind === 'moved-on') {
                return asText({ project: name, ...outcome, scNotified: tellFixEnded(project, preview.track, 'moved-on') });
            }
            return asText({ project: name, ...outcome });
        },
    );
}
