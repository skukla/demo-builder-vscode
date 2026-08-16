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
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
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
    {
        tool: 'get_store_structure',
        description:
            "The Commerce websites, store groups and store views the project's backend actually " +
            'has, plus whether the website/store/store-view codes the project is configured for ' +
            'resolve against them. Use when catalog or PDP pages come back empty, or before ' +
            'trusting a configured store scope.',
        map: edsHandlers,
        type: 'get-store-structure',
    },
    {
        tool: 'get_project_urls',
        description:
            "The current project's useful URLs as data (no browser opened): local storefront " +
            '(while running), EDS live site + DA.live authoring, Commerce admin, and the Developer ' +
            'Console deep link. Absent URLs are omitted.',
        map: dashboardHandlers,
        type: 'getProjectUrls',
    },
];
