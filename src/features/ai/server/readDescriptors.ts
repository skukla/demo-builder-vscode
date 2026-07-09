/**
 * Read/status tool descriptors (Phase 2).
 *
 * Each row dispatches to an EXISTING handler map — the same handler the webview
 * calls — so the agent reuses the extension's logic with no new code. Only
 * handlers verified headless-safe (no `panel`/`sendMessage`/modal) are listed
 * here; action/destructive tools come in later phases.
 *
 * This module imports handler maps (extension-host code), so it is wired in
 * from `extension.ts` rather than from the (vscode-free) server module.
 */

import type { ToolDescriptor } from './toolDescriptors';
import { aiHandlers } from '@/features/dashboard/handlers/aiHandlers';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { meshHandlers } from '@/features/mesh/handlers';

export const READ_DESCRIPTORS: ToolDescriptor[] = [
    {
        tool: 'verify_ai_setup',
        description:
            "Check the project's AI setup (context files, MCP config, skills) and report status",
        map: aiHandlers,
        type: 'verify-ai-setup',
    },
    {
        tool: 'list_ai_prompts',
        description:
            'List saved AI prompts for the current project (global + project-local, merged)',
        map: aiHandlers,
        type: 'list-ai-prompts',
    },
    {
        tool: 'check_mesh',
        description: "Report whether the current project's API mesh is deployed and up to date",
        map: meshHandlers,
        type: 'check-api-mesh',
    },
    {
        tool: 'list_console_apis',
        description:
            "List the Adobe APIs (sdk codes + names) the org can subscribe to on this project's " +
            'Developer Console workspace, flagging the ones Demo Builder already manages. Use before ' +
            'add_console_apis to find the right code (e.g. for Firefly Services).',
        map: dashboardHandlers,
        type: 'listConsoleApis',
    },
];
