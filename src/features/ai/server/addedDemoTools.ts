/**
 * The agent's doors for a demo added from a colleague's link (step 06, D15):
 *
 * - `forget_added_demo` — take a demo off the Add a demo list, and with
 *   `deleteCopy` also delete the SC's own copy of its code. The human door
 *   confirms in two modals; here the gate is `confirm:true`, and the refusal
 *   names the demo, how many projects on this computer were built on it, and
 *   what a delete would cost them.
 * - `change_demo_source` — point the open project at another copy of its
 *   demo. Reads the repository the way the dialog does, builds the same row,
 *   and hands it to the same handler (same storefront kind only).
 *
 * Both run on the same handlers the webviews reach, minus the dialogs.
 *
 * @module features/ai/server/addedDemoTools
 */

import { z } from 'zod';
import { requireGitHub } from './edsToolGuards';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { handleChangeDemoSource } from '@/features/eds/handlers/changeDemoSourceHandler';
import {
    countProjectsBuiltOn,
    forgetDemo,
    isOwnCopy,
    projectsSentence,
} from '@/features/eds/handlers/forgetAddedDemoHandler';
import { handleProbeSharedDemo } from '@/features/eds/handlers/probeSharedDemoHandler';
import { addedDemoKey, readAddedDemos } from '@/features/project-creation/services/addedDemoSettings';
import { buildAddedDemo, INITIAL_DRAFT } from '@/features/project-creation/ui/components/add-demo/addDemoFlow';
import type { HandlerContext } from '@/types/handlers';

const SOURCE_SHAPE = {
    owner: z.string().describe('GitHub owner of the demo repository'),
    repo: z.string().describe('GitHub repository name of the demo'),
};

/**
 * Register the added-demo tools on `server`.
 *
 * @param server     The MCP server
 * @param ctxFactory Builds a headless HandlerContext for each invocation
 */
export function registerAddedDemoTools(server: McpToolServer, ctxFactory: () => HandlerContext): void {
    server.registerTool(
        'forget_added_demo',
        {
            needsAuth: ['github'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                'Take a demo added from a link off the Add a demo list; with deleteCopy:true also delete your own copy of its code from GitHub. Projects built on it are never touched. Requires confirm:true.',
            inputSchema: {
                ...SOURCE_SHAPE,
                deleteCopy: z
                    .boolean()
                    .optional()
                    .describe('Also delete your own copy of the code from GitHub (only when the repository is yours)'),
                confirm: z.boolean().optional().describe('Must be true — the list entry is removed'),
            },
        },
        async (args: { owner: string; repo: string; deleteCopy?: boolean; confirm?: boolean }) => {
            const ctx = ctxFactory();
            const source = { owner: args.owner, repo: args.repo };
            const demo = readAddedDemos().find((row) => addedDemoKey(row) === addedDemoKey({ source }));
            if (!demo) {
                return asText({ error: `No added demo at ${args.owner}/${args.repo}. list_added_demos shows what is remembered.` });
            }
            const github = await requireGitHub(ctx);
            if (github) return asText(github);

            const ownCopy = await isOwnCopy(ctx, demo.source);
            if (args.deleteCopy && !ownCopy) {
                return asText({
                    error: `${demo.source.owner}/${demo.source.repo} is not your copy, so it cannot be deleted from here. Call again without deleteCopy to forget the demo only.`,
                });
            }
            const projectsBuiltOn = await countProjectsBuiltOn(ctx, demo.source);
            if (args.confirm !== true) {
                const cost = args.deleteCopy
                    ? ` Deleting your copy (${demo.source.owner}/${demo.source.repo}) leaves them without reset and updates until they are pointed at another source.`
                    : '';
                return asText({
                    error:
                        `forget_added_demo removes "${demo.name}" from the Add a demo list. ${projectsSentence(projectsBuiltOn)}${cost} ` +
                        'Verify this is the intended demo, then call again with confirm:true.',
                    demo: demo.name,
                    source: demo.source,
                    projectsBuiltOn,
                    destructive: true,
                });
            }
            const result = await forgetDemo(ctx, demo.source, Boolean(args.deleteCopy));
            return asText({ demo: demo.name, source: demo.source, projectsBuiltOn, ...result });
        },
    );

    server.registerTool(
        'change_demo_source',
        {
            needsAuth: ['github'],
            annotations: { readOnlyHint: false, destructiveHint: false },
            description:
                "Point the open project (built on an added demo) at another copy of that demo: a colleague's repository or your own fork. Same storefront kind only. Rewrites where reset and updates read from; the project's code and pages stay as they are. Pointing back undoes it.",
            inputSchema: {
                ...SOURCE_SHAPE,
                keepCopy: z.boolean().optional().describe('Fork the repository into your own account first and read from the fork'),
                updateRemembered: z.boolean().optional().describe('Also move the remembered demo on the Add a demo list to the new source'),
                name: z.string().optional().describe('A name for the demo; defaults to what the repository says'),
            },
        },
        async (args: { owner: string; repo: string; keepCopy?: boolean; updateRemembered?: boolean; name?: string }) => {
            const ctx = ctxFactory();
            const github = await requireGitHub(ctx);
            if (github) return asText(github);

            const probe = await handleProbeSharedDemo(ctx, { owner: args.owner, repo: args.repo });
            if (!probe.success || !probe.result) return asText({ error: probe.error ?? 'The repository could not be read.' });
            const read = probe.result;
            if (read.outcome === 'shipped') {
                return asText({ error: "A project can't be pointed at a demo we ship. Use the demo's own repository." });
            }
            if (read.outcome === 'unreadable') return asText({ error: read.reason });
            if (read.kind === 'not-a-storefront') {
                return asText({
                    error: 'This repository is not a storefront we can build on.',
                    ...(read.missing?.length ? { missing: read.missing } : {}),
                    warnings: read.warnings,
                });
            }
            const demo = buildAddedDemo(read, { ...INITIAL_DRAFT, name: args.name ?? '' });
            const changed = await handleChangeDemoSource(ctx, {
                demo,
                keepCopy: Boolean(args.keepCopy) && !read.viewer?.ownsRepo,
                updateRemembered: Boolean(args.updateRemembered),
            });
            if (!changed.success || !changed.result) return asText({ error: changed.error });
            return asText({
                changed: true,
                demo: changed.result.demo.name,
                source: changed.result.demo.source,
                previous: changed.result.previous,
                ...(changed.result.forkedTo ? { forkedTo: changed.result.forkedTo } : {}),
                // The B2B answer is not asked here: 'unknown' reads as off, which the warnings say.
                warnings: [
                    ...read.warnings,
                    ...(read.b2b === 'unknown'
                        ? ['Whether this demo uses company (B2B) features could not be read; it is treated as off.']
                        : []),
                ],
            });
        },
    );
}
