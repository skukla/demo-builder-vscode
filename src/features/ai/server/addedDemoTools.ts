/**
 * The agent's doors for a demo added from a colleague's link (steps 06–07, D15):
 *
 * - `add_shared_demo` — the dialog's "Add demo" without the dialog: read the
 *   repository, build the same row, remember it. Nothing is created on GitHub
 *   for a link. With `zipPath` (step 10) the zip first becomes a repository in
 *   the SC's account, a real cloud write gated by `confirm:true`.
 * - `forget_added_demo` — take a demo off your Welcome step, and with
 *   `deleteRepository` also delete the repository the extension made from its
 *   zip (step 11). The human door confirms in two modals; here the gate is
 *   `confirm:true`, and the refusal names the demo, how many projects on this
 *   computer were built on it, and what a delete would cost them.
 * - `edit_added_demo` — rename an added demo package's card and change its
 *   description, on the handler the Welcome step's Edit uses. No confirm:
 *   settings only, and editing again undoes it.
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
import { handleEditAddedDemo, notOnWelcomeStep } from '@/features/eds/handlers/editAddedDemoHandler';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import {
    countProjectsBuiltOn,
    forgetDemo,
    isDeletableZipRepository,
    projectsSentence,
    projectWithStorefront,
} from '@/features/eds/handlers/forgetAddedDemoHandler';
import { handleImportStorefrontZip, refusalFor } from '@/features/eds/handlers/importStorefrontZipHandler';
import { handleProbeSharedDemo } from '@/features/eds/handlers/probeSharedDemoHandler';
import { readStorefrontZip, suggestRepoName } from '@/features/eds/services/storefront/zipStorefrontImport';
import { addedDemoKey, readAddedDemos } from '@/features/project-creation/services/addedDemoSettings';
import { buildAddedDemo, INITIAL_DRAFT } from '@/features/project-creation/ui/components/add-demo/addDemoFlow';
import type { HandlerContext } from '@/types/handlers';
import type { AddedDemo, RememberedDemo } from '@/types/projectFile';
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
    description: z
        .string()
        .optional()
        .describe("What the demo's card says under its name; defaults to the repository's description file, else none"),
};

type LinkArgs = { owner?: string; repo?: string; link?: string; name?: string; description?: string };
type ZipArgs = { zipPath?: string; repoName?: string; isPrivate?: boolean; confirm?: boolean };

/**
 * The zip door for the agent: read the zip the way the handler will, refuse
 * what is not a storefront, and gate the repository creation behind
 * `confirm:true` with the refusal naming the repository it would create.
 * Answers the created repository's owner/repo, or the answer to return as is.
 */
async function repositoryFromZip(
    ctx: HandlerContext,
    args: ZipArgs & { zipPath: string },
): Promise<{ owner: string; repo: string; fileCount: number; dropped: number; setupIncluded: boolean } | { answer: Record<string, unknown> }> {
    let unpacked;
    try {
        unpacked = readStorefrontZip(args.zipPath);
    } catch (error) {
        return { answer: { error: `The zip file could not be read: ${(error as Error).message}` } };
    }
    const refusal = await refusalFor(unpacked.files, ctx.logger);
    if (refusal) return { answer: { error: refusal } };
    const repoName = args.repoName?.trim() || suggestRepoName(unpacked.rootName, 'storefront');
    if (args.confirm !== true) {
        const login = (await getGitHubServices(ctx.context.secrets).tokenService.validateToken()).user?.login;
        const account = login ? `your GitHub account (${login})` : 'your GitHub account';
        return {
            answer: {
                error:
                    `add_shared_demo would create the ${args.isPrivate === true ? 'private' : 'public'} repository ${repoName} in ${account} ` +
                    `from ${args.zipPath} (${unpacked.files.size} files; ${unpacked.dropped} entries a repository would not keep are left out) and add the demo from it. ` +
                    'Call again with confirm:true to create it, or give repoName to name it differently.',
                repoName,
                fileCount: unpacked.files.size,
                dropped: unpacked.dropped,
                setupIncluded: Boolean(unpacked.setup),
                wouldCreate: repoName,
            },
        };
    }
    const imported = await handleImportStorefrontZip(ctx, { zipPath: args.zipPath, repoName, isPrivate: args.isPrivate ?? false });
    const result = imported.result as { owner?: string; repo?: string; fileCount?: number; dropped?: number } | undefined;
    if (!imported.success || !result?.owner || !result.repo) {
        return { answer: { error: imported.error ?? 'The zip could not be turned into a repository.' } };
    }
    // Spread over lines: the complex-expression scan reads two `??` on one line as a nested ternary.
    const fileCount = result.fileCount ?? 0;
    const dropped = result.dropped ?? 0;
    return { owner: result.owner, repo: result.repo, fileCount, dropped, setupIncluded: Boolean(unpacked.setup) };
}

/** The human door's rule for offering the delete: a zip's repository, still the SC's own, and no project's storefront. */
async function deletableRepository(ctx: HandlerContext, source: { owner: string; repo: string }): Promise<boolean> {
    if (await projectWithStorefront(ctx, source)) return false;
    return isDeletableZipRepository(ctx, source);
}

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
    const demo = buildAddedDemo(read, { ...INITIAL_DRAFT, name: args.name ?? '', description: args.description ?? '' });
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
                "Add a colleague's demo (or one of your own) to your Welcome step from its GitHub link or site address, so create_project can build on it. Nothing is created on GitHub for a link. Use probe_shared_demo first to see what the demo is. With zipPath instead of a link, a storefront that arrived as a zip file first becomes a repository in your own account (private unless isPrivate:false; named after the zip unless repoName is given), which needs confirm:true.",
            inputSchema: {
                ...LINK_SHAPE,
                zipPath: z.string().optional().describe('Instead of a link: a zip file of the storefront on this computer'),
                repoName: z.string().optional().describe('With zipPath: the repository to create; defaults to the zip\'s folder name'),
                isPrivate: z.boolean().optional().describe('With zipPath: whether the created repository is private (default false)'),
                confirm: z.boolean().optional().describe('Must be true when a repository is created from a zip'),
            },
        },
        async (args: LinkArgs & ZipArgs) => {
            const ctx = ctxFactory();
            const github = await requireGitHub(ctx);
            if (github) return asText(github);

            let fromZip: { fileCount: number; dropped: number; setupIncluded: boolean } | undefined;
            let where: LinkArgs = args;
            if (args.zipPath) {
                const created = await repositoryFromZip(ctx, { ...args, zipPath: args.zipPath });
                if ('answer' in created) return asText(created.answer);
                where = { owner: created.owner, repo: created.repo, name: args.name, description: args.description };
                fromZip = { fileCount: created.fileCount, dropped: created.dropped, setupIncluded: created.setupIncluded };
            }

            const row = await readDemoRow(ctx, where);
            if ('error' in row) return asText(row.error);
            const { warnings } = row;
            // The card records that the extension made the repository, so Remove can offer to delete it.
            const demo: RememberedDemo = fromZip ? { ...row.demo, createdFromZip: true } : row.demo;
            const added = await handleAddSharedDemo(ctx, { demo });
            if (!added.success || !added.result) return asText({ error: added.error });
            return asText({
                added: true,
                id: addedDemoId(added.result.demo),
                demo: added.result.demo.name,
                source: added.result.demo.source,
                storefrontKind: added.result.demo.storefrontKind,
                ...(fromZip ? { createdFromZip: `${where.owner}/${where.repo}`, ...fromZip } : {}),
                ...(fromZip?.setupIncluded
                    ? { setupHint: 'The bundle also carries setup. Import the bundle from the projects list (Import) to start a project pre-filled with it.' }
                    : {}),
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
                'Take an added demo off your Welcome step; with deleteRepository:true also delete the repository Demo Builder made from its zip file (only for a demo added from a zip). Projects built on it are never touched. Requires confirm:true.',
            inputSchema: {
                ...SOURCE_SHAPE,
                deleteRepository: z
                    .boolean()
                    .optional()
                    .describe('Also delete the repository made from the zip file (only for a demo added from a zip)'),
                confirm: z.boolean().optional().describe('Must be true — the list entry is removed'),
            },
        },
        async (args: { owner: string; repo: string; deleteRepository?: boolean; confirm?: boolean }) => {
            const ctx = ctxFactory();
            const source = { owner: args.owner, repo: args.repo };
            const demo = readAddedDemos().find((row) => addedDemoKey(row) === addedDemoKey({ source }));
            if (!demo) {
                return asText({ error: `No added demo at ${args.owner}/${args.repo}. list_demo_packages lists the demo packages on your Welcome step.` });
            }
            const github = await requireGitHub(ctx);
            if (github) return asText(github);

            const repo = `${demo.source.owner}/${demo.source.repo}`;
            if (args.deleteRepository && !(await deletableRepository(ctx, demo.source))) {
                return asText({
                    error: `${repo} was not made from a zip file by Demo Builder in your account, or it is gone or a project's own storefront, so Remove does not delete it. Call again without deleteRepository to forget the demo only.`,
                });
            }
            const projectsBuiltOn = await countProjectsBuiltOn(ctx, demo.source);
            if (args.confirm !== true) {
                const cost = args.deleteRepository
                    ? ` Deleting ${repo} leaves them without reset and updates until they are pointed at another source.`
                    : '';
                return asText({
                    error:
                        `forget_added_demo removes "${demo.name}" from your Welcome step. ${projectsSentence(projectsBuiltOn)}${cost} ` +
                        'Verify this is the intended demo, then call again with confirm:true.',
                    demo: demo.name,
                    source: demo.source,
                    projectsBuiltOn,
                    destructive: true,
                });
            }
            const result = await forgetDemo(ctx, demo.source, Boolean(args.deleteRepository));
            return asText({ demo: demo.name, source: demo.source, projectsBuiltOn, ...result });
        },
    );

    server.registerTool(
        'edit_added_demo',
        {
            needsAuth: false,
            annotations: { readOnlyHint: false, destructiveHint: false },
            description:
                "Rename an added demo package's card on the Welcome step, change its description, or both. Omitted fields stay as they are; an empty description takes it off the card. Projects built on the demo keep their own name.",
            inputSchema: {
                ...SOURCE_SHAPE,
                name: z.string().optional().describe('The new name on the card'),
                description: z.string().optional().describe('The new description under the name; empty removes it'),
            },
        },
        async (args: { owner: string; repo: string; name?: string; description?: string }) => {
            const source = { owner: args.owner, repo: args.repo };
            const demo = readAddedDemos().find((row) => addedDemoKey(row) === addedDemoKey({ source }));
            if (!demo) return asText({ error: notOnWelcomeStep(source) });
            const answer = await handleEditAddedDemo(ctxFactory(), {
                source,
                name: args.name ?? demo.name,
                description: args.description ?? demo.description ?? '',
            });
            if (!answer.success || !answer.result) return asText({ error: answer.error });
            const edited = answer.result.demo;
            return asText({
                edited: true,
                id: addedDemoId(edited),
                name: edited.name,
                ...(edited.description ? { description: edited.description } : {}),
            });
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
                updateDemoPackage: z.boolean().optional().describe('Also point the demo package on your Welcome step at the new source, when there is one for the old source'),
            },
        },
        async (args: LinkArgs & { updateDemoPackage?: boolean }) => {
            const ctx = ctxFactory();
            const github = await requireGitHub(ctx);
            if (github) return asText(github);

            // The project's demo keeps its name across a source change unless a new
            // one is given; the repository's spelling is the default for a NEW demo.
            const current = await ctx.stateManager.getCurrentProject();
            const row = await readDemoRow(ctx, { ...args, name: args.name ?? current?.demo?.name });
            if ('error' in row) return asText(row.error);
            const { demo, warnings } = row;
            const changed = await handleChangeDemoSource(ctx, {
                demo,
                updateDemoPackage: Boolean(args.updateDemoPackage),
            });
            if (!changed.success || !changed.result) return asText({ error: changed.error });
            return asText({
                changed: true,
                demo: changed.result.demo.name,
                source: changed.result.demo.source,
                previous: changed.result.previous,
                warnings,
            });
        },
    );
}
