/**
 * Action tool descriptors (Phase 3a).
 *
 * Like the read descriptors, each row dispatches to an EXISTING handler map —
 * only handlers verified headless-safe (no panel/sendMessage/modal) are listed.
 * Destructive rows set `confirm`. Wired in from `extension.ts`.
 */

import type { ToolDescriptor } from './toolDescriptors';
import { aiHandlers } from '@/features/dashboard/handlers/aiHandlers';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';

export const ACTION_DESCRIPTORS: ToolDescriptor[] = [
    {
        tool: 'regenerate_ai_files',
        description: 'Regenerate the project\'s AI context files (AGENTS.md, .mcp.json, skills)',
        map: aiHandlers,
        type: 'regenerate-ai-files',
    },
    {
        tool: 'start_demo',
        description: 'Start the current project\'s demo server',
        map: dashboardHandlers,
        type: 'startDemo',
    },
    {
        tool: 'stop_demo',
        description: 'Stop the current project\'s running demo server',
        map: dashboardHandlers,
        type: 'stopDemo',
    },
];
