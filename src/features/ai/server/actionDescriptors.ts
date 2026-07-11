/**
 * Action tool descriptors (Phase 3a).
 *
 * Like the read descriptors, each row dispatches to an EXISTING handler map —
 * only handlers verified headless-safe (no panel/sendMessage/modal) are listed.
 * Destructive rows set `confirm`. Wired in from `extension.ts`.
 */

import { z } from 'zod';
import type { ToolDescriptor } from './toolDescriptors';
import { aiHandlers } from '@/features/dashboard/handlers/aiHandlers';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { meshHandlers } from '@/features/mesh/handlers/meshHandlers';

export const ACTION_DESCRIPTORS: ToolDescriptor[] = [
    {
        tool: 'regenerate_ai_files',
        description: "Regenerate the project's AI context files (AGENTS.md, .mcp.json, skills)",
        map: aiHandlers,
        type: 'regenerate-ai-files',
    },
    {
        tool: 'start_demo',
        description: "Start the current project's demo server",
        map: dashboardHandlers,
        type: 'startDemo',
    },
    {
        tool: 'stop_demo',
        description: "Stop the current project's running demo server",
        map: dashboardHandlers,
        type: 'stopDemo',
    },
    {
        tool: 'rename_project',
        description:
            'Rename the current project — the folder on disk, saved state, and the ' +
            "project's MCP/AI configs all move together. Rejected while the demo is " +
            'running. Never rename a project folder with shell commands; always use this.',
        map: dashboardHandlers,
        type: 'renameProject',
        inputSchema: {
            newName: z
                .string()
                .min(1)
                .describe('New project name (letters, digits, hyphens, underscores only)'),
        },
    },
    {
        tool: 'save_ai_prompt',
        description: 'Create or update a saved AI prompt',
        map: aiHandlers,
        type: 'save-ai-prompt',
        inputSchema: {
            prompt: z
                .object({
                    id: z.string().describe('Prompt id (reuse to update; new id to create)'),
                    title: z.string(),
                    prompt: z.string(),
                    pinned: z
                        .boolean()
                        .optional()
                        .describe('true = global (every project); false = project-local'),
                })
                .describe('The prompt to save'),
        },
    },
    {
        tool: 'delete_ai_prompt',
        description: 'Delete a saved AI prompt by id',
        map: aiHandlers,
        type: 'delete-ai-prompt',
        confirm: true,
        inputSchema: { promptId: z.string().describe('Id of the prompt to delete') },
    },
    {
        tool: 'delete_mesh',
        description: 'Delete the API Mesh for an Adobe I/O workspace',
        map: meshHandlers,
        type: 'delete-api-mesh',
        confirm: true,
        inputSchema: {
            workspaceId: z.string().describe('Adobe I/O workspace id whose mesh to delete'),
        },
    },
    {
        tool: 'add_console_apis',
        description:
            "Subscribe Adobe APIs (sdk codes from list_console_apis) on this project's Developer " +
            'Console workspace credential, e.g. to give a custom App Builder app Firefly Services ' +
            'access. Persisted — survives later component adds/removes. Confirm the codes with the ' +
            'user first.',
        map: dashboardHandlers,
        type: 'addConsoleApis',
        inputSchema: {
            apis: z
                .array(z.string())
                .min(1)
                .describe('Adobe sdk codes to subscribe (from list_console_apis)'),
        },
    },
];
