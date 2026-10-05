/**
 * The agent's doors for pages for categories added after setup (EDS-27).
 *
 * - `check_category_pages` — which menu categories have no page yet on the open
 *   project's storefront, and whether this project adds them without asking. A read.
 * - `add_category_pages` — write and publish a page for each of those. ADD-ONLY: no
 *   existing page is rewritten or removed and the nav is not touched. A cloud write, so
 *   `confirm:true`; the refusal names the pages it would write and where.
 *
 * Both go through the catalog menu step (`catalogMenuStep.ts`), the same code the
 * watcher runs while a project is open, so a person and an agent get the same answer.
 *
 * ## What an agent cannot do here, on purpose
 *
 * Turn automatic adding on. The setting (`demoBuilder.categoryPages.autoAdd`) is read
 * with `get_settings` and changed by the SC (`set_setting` hands back); the per-project
 * choice is set from the notices. Switching it on approves unattended cloud writes in
 * advance, and that approval is the SC's to give (CLAUDE.md property 5; owner's ruling
 * 2026-10-05).
 *
 * ## The sign-in is tested by the read, not by the status
 *
 * The stored DA.live sign-in can read as present after it has expired (EDS-30), so
 * these tools do not ask first: they read, and a refused sign-in comes back as the
 * `needsAuth` handoff — never as "no pages" (EDS-29's trap).
 *
 * @module features/ai/server/categoryPageTools
 */

import { z } from 'zod';
import { requireEdsProject } from './edsToolGuards';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { catalogMenuSiteFor, storefrontTarget } from './storefrontPages';
import {
    addNewCategoryPagesStep,
    findNewCategoryPagesStep,
    type CatalogMenuSite,
    type NewCategory,
} from '@/features/eds/services/catalogMenu/catalogMenuStep';
import { describeAdded } from '@/features/eds/services/catalogMenu/catalogMenuSummary';
import {
    AUTO_ADD_SETTING_LEAF,
    AUTO_ADD_SETTING_SECTION,
    readAutoAddOverride,
    resolveAutoAddCategoryPages,
} from '@/features/eds/services/catalogMenu/categoryPageAutoAdd';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

const SETTING_KEY = `${AUTO_ADD_SETTING_SECTION}.${AUTO_ADD_SETTING_LEAF}`;

const NEEDS_DALIVE = {
    needsAuth: 'dalive',
    message:
        "DA.live refused the stored sign-in, so the storefront's pages could not be read (get_auth_status can " +
        'still say signed in after it expires). Use sign_in(provider:"dalive", confirm:true) once the user agrees, then call again.',
};

type SiteFor = (ctx: HandlerContext, project: Project) => CatalogMenuSite | null;

type Opened =
    | { ok: true; ctx: HandlerContext; project: Project; site: CatalogMenuSite; storefront: string }
    | { ok: false; body: Record<string, unknown> };

async function open(ctxFactory: () => HandlerContext, toolName: string, siteFor: SiteFor): Promise<Opened> {
    const ctx = ctxFactory();
    const eds = await requireEdsProject(ctx, toolName);
    if (!eds.ok) return eds;
    const target = storefrontTarget(eds.project);
    const site = siteFor(ctx, eds.project);
    if (!target || !site) {
        return { ok: false, body: { error: 'Project is missing or has malformed GitHub repo metadata' } };
    }
    return { ok: true, ctx, project: eds.project, site, storefront: `${target.daLiveOrg}/${target.daLiveSite}` };
}

const failed = (found: { error: string; signIn: boolean }): Record<string, unknown> =>
    found.signIn ? NEEDS_DALIVE : { error: `Could not check for new categories: ${found.error}` };

function wouldWrite(storefront: string, categories: NewCategory[]): string {
    const pages = categories.map((c) => `${c.name} at ${c.path}`).join(', ');
    const count = categories.length === 1 ? '1 new page' : `${categories.length} new pages`;
    return (
        `add_category_pages would write and publish ${count} on the storefront ${storefront} (${pages}). ` +
        'No existing page and nothing in the nav is changed. Call again with confirm:true.'
    );
}

function ownChoice(project: Project): string {
    const choice = readAutoAddOverride(project);
    if (choice === undefined) return 'follows the setting';
    return choice ? 'on' : 'off';
}

/**
 * Register `check_category_pages` and `add_category_pages`.
 *
 * @param server - the MCP server
 * @param ctxFactory - builds a headless HandlerContext for each invocation
 * @param readAutoAddSetting - reads `demoBuilder.categoryPages.autoAdd`, live
 * @param siteFor - site seam; production builds it from the context's sign-ins
 */
export function registerCategoryPageTools(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
    readAutoAddSetting: () => unknown,
    siteFor: SiteFor = catalogMenuSiteFor,
): void {
    server.registerTool(
        'check_category_pages',
        {
            needsAuth: ['dalive', 'github'],
            annotations: { readOnlyHint: true, destructiveHint: false },
            description:
                "Which Commerce menu categories have no page yet on the open project's Edge Delivery storefront (a category added in Commerce after setup shows in the menu at once but has no page of its own), and whether this project adds such pages without asking. Reads only. Use add_category_pages to add them.",
            inputSchema: {},
        },
        async () => {
            const opened = await open(ctxFactory, 'check_category_pages', siteFor);
            if (!opened.ok) return asText(opened.body);
            const found = await findNewCategoryPagesStep(opened.project, opened.site);
            if (found.status === 'failed') return asText(failed(found));
            const setting = readAutoAddSetting() === true;
            return asText({
                storefront: opened.storefront,
                missing: found.status === 'missing' ? found.categories : [],
                addsAutomatically: resolveAutoAddCategoryPages(opened.project, setting),
                setting: { [SETTING_KEY]: setting, thisProject: ownChoice(opened.project) },
                hint:
                    'add_category_pages (confirm:true) adds the missing pages. A storefront without the catalog menu, ' +
                    'or one never set up by a republish, always answers an empty list — republish (sync_content) sets it up.',
            });
        },
    );

    server.registerTool(
        'add_category_pages',
        {
            needsAuth: ['dalive', 'github'],
            annotations: { readOnlyHint: false, destructiveHint: false },
            description:
                "Write and publish a page for each Commerce menu category that has none on the open project's Edge Delivery storefront. Add-only: never rewrites or removes a page (a hand-built page for a category, at any address, counts as its page) and never changes the nav. Requires confirm:true; reset_project removes the pages it wrote.",
            inputSchema: {
                confirm: z.boolean().optional().describe('Must be true — pages are written to DA.live and published'),
            },
        },
        async (args: { confirm?: boolean }) => {
            const opened = await open(ctxFactory, 'add_category_pages', siteFor);
            if (!opened.ok) return asText(opened.body);
            const { ctx, project, site, storefront } = opened;
            const found = await findNewCategoryPagesStep(project, site);
            if (found.status === 'failed') return asText(failed(found));
            if (found.status === 'nothing') return asText({ added: [], summary: describeAdded([], []) });
            if (args?.confirm !== true) {
                return asText({ error: wouldWrite(storefront, found.categories), missing: found.categories });
            }
            const result = await addNewCategoryPagesStep(project, site);
            if (result.signIn) return asText(NEEDS_DALIVE);
            if (result.added.length > 0) await ctx.stateManager.saveProject(project);
            return asText({ added: result.added, summary: result.summary });
        },
    );
}
