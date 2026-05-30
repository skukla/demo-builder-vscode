/**
 * open_project (Phase 3b) — the offered, confirm-gated "open in IDE & resume"
 * bridge.
 *
 * Anchors a project as the VS Code workspace (which RELOADS the window and ends
 * the current Claude session) and, if a `continuationPrompt` is given, stashes
 * it so the extension replays Claude in the anchored workspace after the reload
 * — reusing the existing `PENDING_CLAUDE_LAUNCH_KEY` + `replayPendingClaudeLaunch`
 * primitive. Lets "create a project, then keep working on it with the project
 * open" happen across the reload.
 *
 * Confirm-gated because it ends the live session; the agent offers it first.
 */

import { z } from 'zod';
import { PENDING_CLAUDE_LAUNCH_KEY } from '@/commands/openInClaude';
import { openProjectAsWorkspace } from '@/features/project-creation/services/projectFinalizationService';
import type { HandlerContext } from '@/types/handlers';

function asText(value: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

/**
 * Register `open_project`.
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext per call.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerOpenProjectTool(server: any, ctxFactory: () => HandlerContext): void {
    server.registerTool(
        'open_project',
        {
            title: 'Open Project',
            description: 'Open a project in VS Code as the workspace and optionally resume with a follow-up prompt. Requires confirm:true — RELOADS the window and ends this session, then resumes',
            inputSchema: {
                name: z.string().describe('Project name to open'),
                continuationPrompt: z
                    .string()
                    .optional()
                    .describe('Prompt to resume with once the project is open (replayed after the reload)'),
                confirm: z
                    .boolean()
                    .optional()
                    .describe('Must be true — this reloads the VS Code window and ends the current session'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) {
                return asText({
                    message: 'open_project requires confirm:true — it reloads the VS Code window and ends this Claude session, then resumes in the project. Ask the user before doing this.',
                });
            }
            const ctx = ctxFactory();
            const name = String(args?.name ?? '');
            const projects = await ctx.stateManager.getAllProjects();
            const project = projects.find((p) => p.name === name);
            if (!project) {
                return asText({ error: `Unknown project: ${name}`, validProjects: projects.map((p) => p.name) });
            }

            // Stash the continuation so the extension replays Claude in the
            // anchored workspace after the reload (reuses the openInClaude primitive).
            const continuationPrompt = typeof args?.continuationPrompt === 'string' ? args.continuationPrompt.trim() : '';
            if (continuationPrompt) {
                await ctx.context.globalState.update(PENDING_CLAUDE_LAUNCH_KEY, {
                    projectPath: project.path,
                    prompt: continuationPrompt,
                    createdAt: Date.now(),
                });
            }

            // Anchor + reload. This ends the current session, so this return may
            // not reach the agent; the extension resumes Claude on reactivation.
            await openProjectAsWorkspace(project.path, ctx.logger);
            return asText({ opening: name, willReload: true, willResume: Boolean(continuationPrompt) });
        },
    );
}
