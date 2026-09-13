/**
 * The agent's doors for a demo added from a colleague's link (steps 06–07, D15):
 *
 * - `add_shared_demo` — the dialog's "Add demo" without the dialog: read the
 *   repository, build the same row, keep a copy when asked (a fork into the
 *   SC's own account, so a real cloud write: gated by `confirm:true` exactly
 *   when it would fork), remember it.
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
import { addedDemoId } from '@/features/components/services/storefrontResolver';
import { handleAddSharedDemo } from '@/features/eds/handlers/addSharedDemoHandler';
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
import type { AddedDemo } from '@/types/projectFile';
import type { SharedDemoRead } from '@/types/webviewRequests';

const SOURCE_SHAPE = {
    owner: z.string().describe('GitHub owner of the demo repository'),
    repo: z.string().describe('GitHub repository name of the demo'),
};

/** Where a demo is: owner+repo, or a link the probe reads to them. */
const LINK_SHAPE = {
    owner: z.string().optional().describe('GitHub owner of the demo repository'),
    repo: z.string().optional().describe('GitHub repository name of the demo'),
    link: z
        .string()
        .optional()
        .describe('Instead of owner+repo: a GitHub link, or the demo site address (main--repo--owner.aem.live)'),
    name: z.string().optional().describe('A name for the demo; defaults to what the repository says'),
};

type LinkArgs = { owner?: string; repo?: string; link?: string; name?: string };

/**
 * Read the repository the way the dialog does and build the row it would
 * commit; the B2B question the dialog asks is not asked here (unknown reads
 * as off, and the warnings say so). Shared by add and change.
 */
export async function readDemoRow(
    ctx: HandlerContext,
    args: LinkArgs,
): Promise<{ demo: AddedDemo; read: SharedDemoRead; warnings: string[] } | { error: Record<string, unknown> }> {
    const probe = await handleProbeSharedDemo(ctx, { owner: args.owner, repo: args.repo, link: args.link });
    if (!probe.success || !probe.result) {
        return { error: { error: probe.error ?? 'The repository could not be read.' } };
    }
    const read = probe.result;
    if (read.outcome === 'shipped') {
        return {
            error: {
                error: `This is the repository behind a demo we ship (${read.shippedPackageId}); use that package id with create_project instead.`,
                shippedPackageId: read.shippedPackageId,
            },
        };
    }
    if (read.outcome === 'unreadable') return { error: { error: read.reason } };
    if (read.kind === 'not-a-storefront') {
        return {
            error: {
                error: 'This repository is not a storefront we can build on.',
                ...(read.missing?.length ? { missing: read.missing } : {}),
                warnings: read.warnings,
            },
        };
    }
    const demo = buildAddedDemo(read, { ...INITIAL_DRAFT, name: args.name ?? '' });
    const warnings = [
        ...read.warnings,
        ...(read.b2b === 'unknown'
            ? ['Whether this demo uses company (B2B) features could not be read; it is treated as off.']
            : []),
    ];
    return { demo, read, warnings };
}

/**
 * Register the added-demo tools on `server`.
 *
 * @param server     The MCP server
 * @param ctxFactory Builds a headless HandlerContext for each invocation
 */
export function registerAddedDemoTools(server: McpToolServer, ctxFactory: () => HandlerContext): void {
    server.registerTool(
        'add_shared_demo',
        {
            needsAuth: ['github'],
            annotations: { readOnlyHint: false, destructiveHint: false },
            description:
                "Add a colleague's demo (or one of your own) to the Add a demo list from its GitHub link or site address, so create_project can build on it. keepCopy (default true) forks the repository into your own GitHub account first, so the demo keeps working if the original changes; that fork needs confirm:true. Use probe_shared_demo first to see what the demo is.",
            inputSchema: {
                ...LINK_SHAPE,
                keepCopy: z
                    .boolean()
                    .optional()
                    .describe('Fork the repository into your own account and read from the fork (default true; skipped for your own repository)'),
                confirm: z.boolean().optional().describe('Must be true when a fork will be made'),
            },
        },
        async (args: LinkArgs & { keepCopy?: boolean; confirm?: boolean }) => {
            const ctx = ctxFactory();
            const github = await requireGitHub(ctx);
            if (github) return asText(github);

            const row = await readDemoRow(ctx, args);
            if ('error' in row) return asText(row.error);
            const { demo, read, warnings } = row;
            const keepCopy = (args.keepCopy ?? true) && !read.viewer?.ownsRepo && !read.viewer?.existingFork;
            if (keepCopy && args.confirm !== true) {
                const account = read.viewer?.login ? `your GitHub account (${read.viewer.login})` : 'your GitHub account';
                return asText({
                    error:
                        `add_shared_demo would fork ${read.fullName} into ${account} and read from the fork. ` +
                        'Call again with confirm:true to make the fork, or keepCopy:false to add the demo without one.',
                    demo: demo.name,
                    source: demo.source,
                    wouldFork: read.fullName,
                });
            }
            // An existing fork is the copy already (the dialog says so); the add
            // handler reads from it by asking for a fork, which GitHub answers with
            // the one that exists.
            const added = await handleAddSharedDemo(ctx, {
                demo,
                keepCopy: (args.keepCopy ?? true) && !read.viewer?.ownsRepo,
            });
            if (!added.success || !added.result) return asText({ error: added.error });
            return asText({
                added: true,
                id: addedDemoId(added.result.demo),
                demo: added.result.demo.name,
                source: added.result.demo.source,
                storefrontKind: added.result.demo.storefrontKind,
                ...(added.result.forkedTo ? { forkedTo: added.result.forkedTo } : {}),
                warnings,
                hint: 'create_project takes the id above as its package; list_demo_packages lists it beside the shipped ones.',
            });
        },
    );

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
                return asText({ error: `No added demo at ${args.owner}/${args.repo}. list_demo_packages shows what is remembered.` });
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
                ...LINK_SHAPE,
                keepCopy: z.boolean().optional().describe('Fork the repository into your own account first and read from the fork'),
                updateRemembered: z.boolean().optional().describe('Also move the remembered demo on the Add a demo list to the new source'),
            },
        },
        async (args: LinkArgs & { keepCopy?: boolean; updateRemembered?: boolean }) => {
            const ctx = ctxFactory();
            const github = await requireGitHub(ctx);
            if (github) return asText(github);

            // The project's demo keeps its name across a source change unless a new
            // one is given; the repository's spelling is the default for a NEW demo.
            const current = await ctx.stateManager.getCurrentProject();
            const row = await readDemoRow(ctx, { ...args, name: args.name ?? current?.demo?.name });
            if ('error' in row) return asText(row.error);
            const { demo, read, warnings } = row;
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
                warnings,
            });
        },
    );
}
