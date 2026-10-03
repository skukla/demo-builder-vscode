/**
 * The agent's doors to the catalog menu (EDS-24): the dashboard's two messages, on the
 * same handlers (`catalogMenuHandlers.ts`), minus the dialog.
 *
 * - `build_catalog_menu` — one page per Commerce category marked "Include in Menu", and
 *   the menu line plus the `catalog-menu` block in the nav. It publishes to a live site,
 *   so (CLAUDE.md property 5) it is `confirm:true`-gated with the consent dialog; the
 *   refusal first READS the tree and names the site and how many pages would go live.
 *   Refuses, and changes nothing, when the storefront does not have the block yet.
 * - `remove_catalog_menu` — the undo. Unpublishes and deletes pages, so `confirm:true`
 *   and the consent dialog, like `delete_page`.
 *
 * @module features/ai/server/catalogMenuTools
 */

import { z } from 'zod';
import { requireDaLive, requireGitHub } from './edsToolGuards';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import {
    handleBuildCatalogMenu,
    handleRemoveCatalogMenu,
    previewCatalogMenu,
} from '@/features/dashboard/handlers/catalogMenuHandlers';
import { readCatalogMenuRecord } from '@/features/eds/services/catalogMenu/catalogMenuRecord';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** DA.live first (the pages live there), then GitHub (publishing sends it). */
async function signInHandoff(ctx: HandlerContext): Promise<Record<string, unknown> | undefined> {
    return (await requireDaLive(ctx)) ?? requireGitHub(ctx);
}

function answer(result: HandlerResponse) {
    if (!result.success) return asText({ error: result.error, ...(result.code ? { code: result.code } : {}) });
    return asText(result.data);
}

/** What the build would publish, read first so the consent names it (property 5). */
async function buildRefusal(ctx: HandlerContext) {
    const preview = await previewCatalogMenu(ctx);
    if (!preview.success) {
        return asText({
            error:
                `build_catalog_menu could not count the pages it would publish (${preview.error}). It writes and ` +
                "publishes one category page per menu category to the live storefront and adds a 'Shop the catalog' " +
                'line and the catalog-menu block to its nav. Call again with confirm:true to try.',
        });
    }
    const { site, pages } = preview.data as { site: string; pages: number };
    return asText({
        error:
            `build_catalog_menu writes and publishes ${pages} category pages to the live storefront ${site} ` +
            "and adds a 'Shop the catalog' line and the catalog-menu block to its nav. Pages edited by hand are left " +
            'alone. Call again with confirm:true.',
        site,
        pages,
    });
}

async function removalRefusal(ctx: HandlerContext) {
    const project = await ctx.stateManager.getCurrentProject();
    const pages = project ? readCatalogMenuRecord(project).pages.length : 0;
    return asText({
        error:
            `remove_catalog_menu unpublishes and deletes the ${pages} category pages Demo Builder wrote and takes the ` +
            'catalog menu out of the nav. Pages edited by hand are left alone. Call again with confirm:true.',
        destructive: true,
    });
}

/**
 * Register the catalog menu tools on `server`.
 *
 * @param server     The MCP server
 * @param ctxFactory Builds a headless HandlerContext for each invocation
 */
export function registerCatalogMenuTools(server: McpToolServer, ctxFactory: () => HandlerContext): void {
    server.registerTool(
        'build_catalog_menu',
        {
            needsAuth: ['dalive', 'github'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                "Build the open storefront's menu from the Commerce catalog: write and publish one page per category set to Include in Menu, and add a 'Shop the catalog' line and the catalog-menu block to the nav (hand-typed nav items stay). Needs the Demo Builder Blocks library in the storefront; says how to add it otherwise. Never overwrites a page edited by hand. Publishes to the live site, so it requires confirm:true; remove_catalog_menu undoes it.",
            inputSchema: {
                confirm: z.boolean().optional().describe('Must be true — pages are written and published to the live site'),
            },
        },
        async (args: { confirm?: boolean }) => {
            const ctx = ctxFactory();
            const handoff = await signInHandoff(ctx);
            if (handoff) return asText(handoff);
            if (args.confirm !== true) return buildRefusal(ctx);
            return answer(await handleBuildCatalogMenu(ctx, undefined));
        },
    );

    server.registerTool(
        'remove_catalog_menu',
        {
            needsAuth: ['dalive', 'github'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                "Undo build_catalog_menu: unpublish and delete the category pages Demo Builder wrote (pages edited since are left alone) and take the catalog menu back out of the nav. Requires confirm:true.",
            inputSchema: {
                confirm: z.boolean().optional().describe('Must be true — pages are unpublished and deleted'),
            },
        },
        async (args: { confirm?: boolean }) => {
            const ctx = ctxFactory();
            const handoff = await signInHandoff(ctx);
            if (handoff) return asText(handoff);
            if (args.confirm !== true) return removalRefusal(ctx);
            return answer(await handleRemoveCatalogMenu(ctx, undefined));
        },
    );
}
