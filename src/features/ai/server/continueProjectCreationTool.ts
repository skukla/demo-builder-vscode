/**
 * `continue_project_creation` — answer a project creation that paused on a failed step.
 *
 * The agent's half of the wizard's paused screen (F307). When a step of an agent's
 * creation fails, `create_project` (and `create_project_from_file`, `copy_project`)
 * answers "paused" with the step, the reason and the answers, and the run waits. The
 * agent fixes the cause with its tools, then answers here: Retry or Check Again runs
 * the step again, Skip This Step goes on without it where the project can. The call
 * then waits for the next pause or the end, and answers as `create_project` would.
 * `cancel_project_creation` stops a paused run and removes the half-built project.
 *
 * @module features/ai/server/continueProjectCreationTool
 */

import { z } from 'zod';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import {
    answerPausedCreation,
    untilPausedOrEnded,
    type AgentRunState,
} from '@/features/project-creation/handlers/creationAgentPause';
import { SKIP_STEP } from '@/features/project-creation/handlers/creationPause';
import type { HandlerContext } from '@/types/handlers';
import type { CreationPauseNotice } from '@/types/webview';

type ToolResult = ReturnType<typeof asText>;

/** What the agent is told about a paused creation, and how to go on. */
function pausedResult(projectName: string, pause: CreationPauseNotice): ToolResult {
    return asText({
        created: false,
        paused: true,
        name: projectName,
        step: pause.step,
        reason: pause.reason,
        answers: [...pause.actions, ...(pause.canSkip ? [SKIP_STEP] : [])],
        hint:
            'The creation is waiting, with every step before this one done. Find and fix the ' +
            'cause with the Demo Builder tools, then call continue_project_creation with ' +
            'projectName and one of the answers. cancel_project_creation stops it and removes ' +
            'the half-built project.',
    });
}

function answerFor(projectName: string, state: AgentRunState<unknown>): ToolResult {
    return 'paused' in state
        ? pausedResult(projectName, state.paused)
        : (state.ended as ToolResult);
}

/**
 * Run an agent's creation until it ends or pauses, and answer the agent.
 *
 * @param ctx - the run's context
 * @param projectName - the project being created
 * @param ended - the run and the door's answer when it ends; it never rejects
 * @returns the door's answer, or the pause
 */
export async function untilAgentHearsBack(
    ctx: HandlerContext,
    projectName: string,
    ended: Promise<ToolResult>,
): Promise<ToolResult> {
    return answerFor(projectName, await untilPausedOrEnded(ctx, projectName, ended));
}

/**
 * Register `continue_project_creation`.
 *
 * @param server - the MCP tool server
 */
export function registerContinueProjectCreationTool(server: McpToolServer): void {
    server.registerTool(
        'continue_project_creation',
        {
            needsAuth: false,
            annotations: { readOnlyHint: false, destructiveHint: false },
            title: 'Continue Project Creation',
            description:
                'Answer a project creation that paused on a failed step: create_project, create_project_from_file or copy_project answered paused:true with the step, the reason and its answers. Fix the cause first, then answer Retry or Check Again to run the step again, or Skip This Step to go on without it where the answers offer it. Waits for the next pause or the end and answers as create_project does.',
            inputSchema: {
                projectName: z.string().describe('Name of the project being created'),
                answer: z
                    .string()
                    .describe('One of the answers the paused result offered: Retry, Check Again or Skip This Step'),
            },
        },
        async (args: { projectName?: string; answer?: string }) => {
            const projectName = String(args?.projectName ?? '').trim();
            if (!projectName) return asText({ error: 'projectName is required.' });
            const state = await answerPausedCreation(projectName, String(args?.answer ?? ''));
            if ('error' in state) return asText({ error: state.error });
            return answerFor(projectName, state);
        },
    );
}
