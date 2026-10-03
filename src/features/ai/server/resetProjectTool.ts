/**
 * reset_project — return the CURRENT project to its starting point.
 *
 * ONE tool, two kinds of project, because "reset" is one action: the person's
 * Reset button already dispatches on the project's kind (`handleResetProject`),
 * and the agent's door now does the same.
 *
 *  - An Edge Delivery project: `runEdsReset` (`edsResetTool.ts`) rewrites the
 *    storefront repository and its DA.live content to the template.
 *  - A headless project: `executeProjectReset` (`projectResetService.ts`) deletes
 *    the components and installs them again — the core `resetProjectWithUI`
 *    wraps, minus its dialog and notification.
 *
 * Until 2026-10-03 this was `reset_eds_project` and refused a headless project,
 * which left an agent unable to do what the button did.
 *
 * Destructive, so gated by `confirm:true`; the refusal names the project and what
 * this kind of reset removes, so a wrong target can be noticed before it is
 * confirmed. Both resets are re-runnable, so a failure answers `rerunSafe:true`.
 *
 * A reset has no undo. It IS the return to zero (CLAUDE.md property 1), and what
 * it removes — hand edits to the storefront or to a component folder — exists
 * nowhere else. That is why it asks first and why integrations, whose code may
 * be the SC's own work, are left alone.
 */

import { z } from 'zod';
import { runWithAdobeTarget } from './adobeTargetStore';
import { adobeAuthed, runEdsReset } from './edsResetTool';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import { stageLine } from '@/core/utils/stageLine';
import { executeProjectReset } from '@/features/lifecycle/services/projectResetService';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { getMeshComponentInstance, isEdsProject } from '@/types/typeGuards';

type ToolResult = ReturnType<typeof asText>;

/** What each kind of reset removes, for the refusal an agent reads before confirming. */
const WHAT_IT_REMOVES: Record<'storefront' | 'headless', (target: string) => string> = {
    storefront: (target) =>
        `reset_project rewrites the storefront repo and DA.live content of ${target} to the template.`,
    headless: (target) =>
        `reset_project deletes the components of ${target} and installs them again from ` +
        'scratch; integrations and configuration are kept.',
};

/** The unconfirmed call's answer: which project, which kind of reset, and how to proceed. */
function confirmRefusal(project: Project, kind: keyof typeof WHAT_IT_REMOVES): ToolResult {
    return asText({
        error:
            `${WHAT_IT_REMOVES[kind](`"${project.name}" (${project.path})`)} Verify this is ` +
            'the intended project, then call again with confirm:true.',
        project: project.name,
        kind,
        destructive: true,
    });
}

/** The headless half: pre-flight, then the shared component reset with its timeline. */
async function runHeadlessReset(ctx: HandlerContext, project: Project): Promise<ToolResult> {
    // The button stops a running demo itself. An agent is told to, so the stop is
    // a call it made and can see, not a side effect of a different request.
    if (project.status === 'running' || project.status === 'starting') {
        return asText({
            error: `"${project.name}" is running. Stop it with stop_demo, then call reset_project again.`,
            project: project.name,
        });
    }
    if (getMeshComponentInstance(project)?.path && !(await adobeAuthed())) {
        return asText({
            needsAuth: 'adobe',
            message:
                'Adobe sign-in required to redeploy the mesh. Check get_auth_status, then sign_in(provider:"adobe", confirm:true) once the user agrees.',
        });
    }

    const phases: Array<{ step: number; totalSteps: number; message: string }> = [];
    try {
        // Under the stored session org context, so the mesh redeploy targets the
        // selected org/workspace via env (no global mutation).
        const outcome = await runWithAdobeTarget(() =>
            executeProjectReset(
                {
                    project,
                    context: ctx,
                    logPrefix: '[Agent]',
                    commandManager: ServiceLocator.getCommandExecutor(),
                    authManager: ServiceLocator.getAuthenticationService(),
                },
                (stage, _step, position) => {
                    // A stage reports again for each line under it; the timeline
                    // keeps one row per stage.
                    if (phases[phases.length - 1]?.message === stage) return;
                    phases.push({
                        step: position?.index ?? phases.length + 1,
                        totalSteps: position?.total ?? 0,
                        message: stage,
                    });
                    reportPhase(stageLine(stage, position));
                },
            ),
        );
        if (!outcome.success) {
            return asText({ reset: false, project: project.name, error: outcome.error, phases });
        }
        return asText({
            reset: true,
            project: project.name,
            kind: 'headless',
            meshRedeployed: outcome.meshRedeployed ?? false,
            ...(outcome.error ? { warning: outcome.error } : {}),
            phases,
        });
    } catch (cause) {
        ctx.logger.error('[Agent] Project reset failed', cause instanceof Error ? cause : undefined);
        return asText({
            reset: false,
            project: project.name,
            stage: 'project-reset',
            error: 'The reset did not finish. See Debug Logs for the cause, fix it, and call reset_project again.',
            phases,
            rerunSafe: true,
        });
    }
}

/**
 * Register the reset_project tool on `server`.
 *
 * @param server     The tool server.
 * @param ctxFactory Builds a headless HandlerContext for each invocation.
 */
export function registerResetProjectTool(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'reset_project',
        {
            // Adobe for a mesh redeploy (either kind); DA.live for a storefront.
            needsAuth: ['adobe', 'dalive'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                'Reset the current project to its starting point, Edge Delivery or headless. ' +
                'An Edge Delivery project: the storefront repo, DA.live content and config go back to the template. A headless ' +
                'project: its components are deleted and installed again (stop the demo first); ' +
                'integrations and configuration are kept. Requires confirm:true.',
            inputSchema: {
                includeBlockLibrary: z
                    .boolean()
                    .optional()
                    .describe('Edge Delivery only: also reset the installed block library'),
                verifyCdn: z
                    .boolean()
                    .optional()
                    .describe('Edge Delivery only: verify config.json on the CDN after reset'),
                applyFixes: z
                    .boolean()
                    .optional()
                    .describe(
                        "Added demos only: apply the Demo Builder fixes that fit the demo's code (one commit). " +
                            'Only when the user said yes to them; the default offers them and writes none',
                    ),
                confirm: z
                    .boolean()
                    .optional()
                    .describe('Must be true — a reset discards what was customised in the project'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            // Resolve the target BEFORE the confirm gate, so the refusal can
            // name the project this call would reset. The pointer is re-read
            // from disk per call, but which project it names can still surprise
            // an agent (another window, another conversation, changed it) — an
            // anonymous "call again with confirm:true" gives the agent no
            // chance to notice.
            const ctx = ctxFactory();
            const project = await ctx.stateManager.getCurrentProject();
            if (!project) return asText({ error: 'No current project is open' });
            const kind = isEdsProject(project) ? 'storefront' : 'headless';

            if (args?.confirm !== true) return confirmRefusal(project, kind);
            return kind === 'storefront'
                ? runEdsReset(ctx, project, args)
                : runHeadlessReset(ctx, project);
        },
    );
}
