/**
 * The agent's doors for category pages (EDS-24): the same two handlers the
 * dashboard calls, `generateCategoryPages` and `removeCategoryPages`.
 *
 * - `generate_category_pages` — read the Commerce category tree for the project's
 *   store view and write + publish one storefront page per menu category. Puts
 *   pages on the live site, so `confirm:true` and the consent dialog.
 * - `remove_category_pages` — the undo: unpublish and delete exactly the pages
 *   generate wrote, leaving any the SC has edited since. `confirm:true`.
 *
 * Both refuse unconfirmed BEFORE asking for sign-ins, so the refusal explains
 * itself first (the `republish` rule), and name the storefront it would change.
 *
 * @module features/ai/server/categoryPagesTools
 */

import { z } from 'zod';
import { requireDaLive, requireGitHub } from './edsToolGuards';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import {
    handleGenerateCategoryPages,
    handleRemoveCategoryPages,
} from '@/features/dashboard/handlers/categoryPagesHandlers';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import { getEdsGithubRepo } from '@/types/typeGuards';

/** What the tools dispatch into; the defaults are the dashboard's handlers. */
export interface CategoryPagesToolDeps {
    generate: MessageHandler<{ rootCategoryId?: string }>;
    remove: MessageHandler;
    /** The sign-in handoff, or undefined when DA.live and GitHub are both live. */
    signIns(ctx: HandlerContext): Promise<Record<string, unknown> | undefined>;
}

const LIVE: CategoryPagesToolDeps = {
    generate: handleGenerateCategoryPages,
    remove: handleRemoveCategoryPages,
    signIns: async (ctx) =>
        (await requireDaLive(ctx, ' to write the pages')) ?? requireGitHub(ctx, ' to publish the pages'),
};

/** The storefront a call would change, in words a person can check. */
async function storefrontName(ctx: HandlerContext): Promise<string> {
    const project = await ctx.stateManager.getCurrentProject();
    return getEdsGithubRepo(project) ?? project?.name ?? 'the open project';
}

/** A handler's answer as the tool's: the data on success, the refusal whole on failure. */
function answer(res: HandlerResponse): ReturnType<typeof asText> {
    if (res.success) return asText(res.data);
    const { success: _ok, ...refusal } = res;
    return asText(refusal);
}

const confirmField = z.boolean().optional().describe('Must be true to proceed');

/**
 * Register the category-page tools on `server`.
 *
 * @param server     The MCP server
 * @param ctxFactory Builds a headless HandlerContext for each invocation
 * @param deps       The handlers and sign-in check; production never passes it
 */
export function registerCategoryPagesTools(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
    deps: CategoryPagesToolDeps = LIVE,
): void {
    server.registerTool(
        'generate_category_pages',
        {
            needsAuth: ['dalive', 'github'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                "Give every Commerce category a storefront page: read the category tree for the open Edge Delivery project's store view and write + publish one page per category at its URL path (its name as the heading, then the product-list-page block), skipping categories Commerce keeps out of the menu. Re-running rewrites the same pages; a page edited by hand since, or one Demo Builder did not write, is left alone and reported. remove_category_pages undoes it. Requires confirm:true.",
            inputSchema: {
                rootCategoryId: z
                    .string()
                    .regex(/^\d+$/)
                    .optional()
                    .describe("Start from this category id instead of the store view's root"),
                confirm: confirmField,
            },
        },
        async (args: { rootCategoryId?: string; confirm?: boolean }) => {
            const ctx = ctxFactory();
            if (args.confirm !== true) {
                return asText({
                    error:
                        `generate_category_pages writes and publishes one page per Commerce category into ${await storefrontName(ctx)}, ` +
                        'live at once. Pages edited by hand are never overwritten. To proceed, call again with confirm:true.',
                });
            }
            const signIn = await deps.signIns(ctx);
            if (signIn) return asText(signIn);
            const payload = args.rootCategoryId ? { rootCategoryId: args.rootCategoryId } : {};
            return answer(await deps.generate(ctx, payload));
        },
    );

    server.registerTool(
        'remove_category_pages',
        {
            needsAuth: ['dalive', 'github'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                "Undo generate_category_pages: unpublish and delete exactly the category pages it wrote into the open project's storefront. A page edited by hand since is left in place and reported. Requires confirm:true.",
            inputSchema: { confirm: confirmField },
        },
        async (args: { confirm?: boolean }) => {
            const ctx = ctxFactory();
            if (args.confirm !== true) {
                const project = await ctx.stateManager.getCurrentProject();
                const count = Object.keys(project?.categoryPages?.pages ?? {}).length;
                return asText({
                    error:
                        `remove_category_pages unpublishes and deletes the ${count} category page(s) Demo Builder wrote into ` +
                        `${await storefrontName(ctx)}; visitors stop seeing them at once. To proceed, call again with confirm:true.`,
                    pages: count,
                });
            }
            const signIn = await deps.signIns(ctx);
            if (signIn) return asText(signIn);
            return answer(await deps.remove(ctx, undefined));
        },
    );
}
