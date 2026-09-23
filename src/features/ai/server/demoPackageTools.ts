/**
 * The agent's doors for "Save as demo package" (step 09): the dashboard
 * dialog's three messages, on the same handlers, minus the dialog.
 *
 * - `get_demo_package_preview` — what the card would carry, the checks a
 *   project built from it will need, whether it is already on the SC's list,
 *   and the link. A read.
 * - `save_demo_package` — write the description file into the SC's own
 *   storefront repository, put the card on their Welcome step, mark the
 *   repository a template when asked, and answer the link. A write into the
 *   SC's GitHub, so `confirm:true`; the refusal says what it would write and where.
 * - `remove_demo_package` — take back what save_demo_package did. Destructive
 *   for colleagues holding the link, so `confirm:true` and the consent dialog.
 * - `export_demo_bundle` — Export's "Send a file": one bundle of the ticked parts
 *   (setup without credentials, the storefront with its description file),
 *   written inside the project directory. A local file, so no gate.
 *
 * @module features/ai/server/demoPackageTools
 */

import { z } from 'zod';
import { requireGitHub } from './edsToolGuards';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import {
    handleGetDemoPackagePreview,
    handleRemoveDemoPackage,
    handleSaveDemoPackage,
} from '@/features/dashboard/handlers/demoPackageHandlers';
import { handleExportDemoBundle } from '@/features/dashboard/handlers/exportDemoBundleHandler';
import type { HandlerContext } from '@/types/handlers';
import type {
    DemoPackagePreview,
    ExportDemoBundleResult,
    RemoveDemoPackageResult,
    SaveDemoPackageResult,
} from '@/types/webviewRequests';

const HINT =
    'The card is on your Welcome step; create_project takes its id (list_demo_packages shows it). A colleague pastes the link into "Add a demo package", or hands it to add_shared_demo.';

/**
 * Register the demo-package tools on `server`.
 *
 * @param server     The MCP server
 * @param ctxFactory Builds a headless HandlerContext for each invocation
 */
export function registerDemoPackageTools(server: McpToolServer, ctxFactory: () => HandlerContext): void {
    server.registerTool(
        'get_demo_package_preview',
        {
            needsAuth: ['github'],
            annotations: { readOnlyHint: true, destructiveHint: false },
            description:
                "What saving the open project's storefront as a demo package would give: the name and description the card would carry, whether colleagues can open its code, whether they start with your published pages, whether the sample data is available to them, whether it is already on your Welcome step, and the link a colleague adds it from. Edge Delivery projects only. Read this before save_demo_package.",
            inputSchema: {},
        },
        async () => {
            const ctx = ctxFactory();
            const github = await requireGitHub(ctx);
            if (github) return asText(github);
            const answer = await handleGetDemoPackagePreview(ctx, undefined);
            if (!answer.success || !answer.data) return asText({ error: answer.error });
            return asText(answer.data as DemoPackagePreview);
        },
    );

    server.registerTool(
        'save_demo_package',
        {
            needsAuth: ['github'],
            annotations: { readOnlyHint: false, destructiveHint: false },
            description:
                "Save the open project's storefront as a demo package: write its description file (demo.demo-builder.json) into your own storefront repository and put the card on your Welcome step, so you and colleagues (from the link) can build new projects on it. Never overwrites a file it did not write. Requires confirm:true; remove_demo_package undoes it.",
            inputSchema: {
                name: z.string().optional().describe('The name on the card; defaults to the brand or demo the project was built on'),
                description: z.string().optional().describe('One or two sentences about the demo'),
                confirm: z.boolean().optional().describe('Must be true — a file is written into your repository'),
            },
        },
        async (args: { name?: string; description?: string; confirm?: boolean }) => {
            const ctx = ctxFactory();
            const github = await requireGitHub(ctx);
            if (github) return asText(github);

            const preview = await handleGetDemoPackagePreview(ctx, undefined);
            if (!preview.success || !preview.data) return asText({ error: preview.error });
            const { draft, link, checks, saved, onList } = preview.data as DemoPackagePreview;
            const name = args.name?.trim() || draft.name;
            const description = args.description?.trim() || draft.description;
            if (args.confirm !== true) {
                return asText({
                    error:
                        `save_demo_package would write demo.demo-builder.json named "${name}" into ${link} and put the card on your Welcome step. ` +
                        'Call again with confirm:true to do it.',
                    name,
                    description,
                    checks,
                    alreadySaved: saved,
                    alreadyOnList: onList,
                });
            }
            const result = await handleSaveDemoPackage(ctx, { name, description });
            if (!result.success || !result.data) return asText({ error: result.error });
            const data = result.data as SaveDemoPackageResult;
            return asText({ ...data, hint: HINT });
        },
    );

    server.registerTool(
        'remove_demo_package',
        {
            needsAuth: ['github'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                "Remove the open project's demo package: take the description file save_demo_package wrote out of your storefront repository, and take the card off your Welcome step. Colleagues who already added it keep it. Requires confirm:true.",
            inputSchema: {
                confirm: z.boolean().optional().describe('Must be true — the description file is removed from your repository'),
            },
        },
        async (args: { confirm?: boolean }) => {
            const ctx = ctxFactory();
            const github = await requireGitHub(ctx);
            if (github) return asText(github);
            if (args.confirm !== true) {
                const project = await ctx.stateManager.getCurrentProject();
                return asText({
                    error:
                        'remove_demo_package takes the description file out of your storefront repository and the card off your Welcome step; colleagues can no longer add it from its link. ' +
                        'Call again with confirm:true.',
                    ...(project?.demoPackage ? { savedAt: project.demoPackage.savedAt } : {}),
                    destructive: true,
                });
            }
            const result = await handleRemoveDemoPackage(ctx, undefined);
            if (!result.success || !result.data) return asText({ error: result.error });
            return asText(result.data as RemoveDemoPackageResult);
        },
    );

    server.registerTool(
        'export_demo_bundle',
        {
            needsAuth: ['github'],
            annotations: { readOnlyHint: false, destructiveHint: false },
            description:
                "Export the open project as a file to send to someone who can't reach your GitHub or the shared services: one zip bundle with the ticked parts — setup (your settings, never a credential) and the storefront (the repository's code with the demo's description file inside, Edge Delivery only). Written inside the project directory as <project>-demo-bundle.zip unless path is given. Setup alone writes the plain settings file the projects list imports. Prefer sharing a link (save_demo_package): a file has no history and never gets later changes.",
            inputSchema: {
                path: z.string().optional().describe('Where to write, inside the project directory (default <project>/<project>-demo-bundle.zip)'),
                setup: z.boolean().optional().describe('Include the setup part (default true)'),
                storefront: z.boolean().optional().describe('Include the storefront part (default true; Edge Delivery only)'),
            },
        },
        async (args: { path?: string; setup?: boolean; storefront?: boolean }) => {
            const ctx = ctxFactory();
            const github = await requireGitHub(ctx);
            if (github) return asText(github);
            const result = await handleExportDemoBundle(ctx, { path: args.path, setup: args.setup, storefront: args.storefront });
            if (!result.success || !result.data) return asText({ error: result.error });
            return asText(result.data as ExportDemoBundleResult);
        },
    );
}
