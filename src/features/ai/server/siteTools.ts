/**
 * Storefront SITE tools (Phase 4, Group 6) — who administers a storefront's
 * Configuration Service entry, and how to repair it when the registration was
 * refused.
 *
 * ## None of these is a descriptor row
 *
 * Groups 1–5 were mostly ten-line `{map, type}` rows because every handler was
 * already in a handler map. These are not: they are services taking
 * `(project, vscode.ExtensionContext, logger)`, so they are reached through a
 * `HandlerContext`'s own fields rather than by dispatch. Being UI-free is what
 * makes them usable from a tool; it is not what makes them dispatchable, and
 * conflating the two is what made this group look ten times cheaper than it is.
 *
 * ## Why the site-access pair is split in two
 *
 * The command behind it is one QuickPick, but a tool that both lists and mutates
 * would need a mode argument, and the read is the far more common call — an
 * agent asks "who can fix this?" long before it asks to change anything. Split,
 * the read is free of a confirm gate and the write carries one.
 *
 * ## Real email addresses, deliberately
 *
 * `get_site_access` returns the admin lists unmasked. The whole use of the tool
 * is naming the person who must grant a role, and a masked address cannot be
 * relayed to the user or passed to `set_site_admin`. This is not the
 * `get_project` secret case: an address is not a credential, and the extension's
 * masking exists for the diagnostics report, whose output is written to be
 * pasted into tickets.
 *
 * ## `repair_site_configuration` does not publish
 *
 * That separation is `repairSiteConfigHeadless`'s own, and the reason it gives
 * is exactly this surface: registration writes a routing rule, and making it
 * take effect would republish a demo out from under whoever is presenting it.
 * The command pairs the two because a person asked for it; the tool names
 * `republish` as what remains instead.
 *
 * @module features/ai/server/siteTools
 */

import { z } from 'zod';
import { needsUser } from './handoff';
import { asText } from './mcpToolResult';
import { repairSiteConfigForProject } from '@/features/eds/services/repairSiteConfigForProject';
import {
    addSiteAdmin,
    listSiteAccess,
    removeSiteAdmin,
} from '@/features/eds/services/siteAccessManagerHeadless';
import type { HandlerContext } from '@/types/handlers';

/**
 * Register `get_site_access`, `set_site_admin`, `repair_site_configuration` and
 * `connect_dalive` on `server`.
 *
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext for each invocation.
 */
export function registerSiteTools(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'get_site_access',
        {
            title: 'Get Site Access',
            description:
                "Who holds the admin role on the current project's storefront configuration, and " +
                'whether this identity can change it. Use when a Configuration Service write was ' +
                'refused, to find out who can grant access.',
            inputSchema: {},
        },
        async () => {
            const ctx = ctxFactory();
            const project = await ctx.stateManager.getCurrentProject();
            if (!project) {
                return asText({ error: 'No current project is open' });
            }
            return asText(await listSiteAccess(project, ctx.context, ctx.logger));
        },
    );

    server.registerTool(
        'set_site_admin',
        {
            title: 'Set Site Admin',
            description:
                "Grant or revoke the admin role on the current project's storefront configuration. " +
                'Requires confirm:true — it changes who can administer a shared site. Check ' +
                'get_site_access first; this identity must already hold the role.',
            inputSchema: {
                email: z.string().describe('The address to grant or revoke'),
                admin: z
                    .boolean()
                    .describe('true grants the admin role, false revokes it'),
                confirm: z
                    .boolean()
                    .optional()
                    .describe('Must be true — this changes access for another person; ask the user first'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) {
                return asText({
                    error:
                        'set_site_admin requires confirm:true — it changes who can administer the ' +
                        'site configuration. Ask the user first.',
                });
            }
            const ctx = ctxFactory();
            const project = await ctx.stateManager.getCurrentProject();
            if (!project) {
                return asText({ error: 'No current project is open' });
            }

            const email = String(args.email ?? '');
            // Both halves verify by re-reading the role list, so `verified` on the
            // result is a re-read, never the write's status code.
            const result = args.admin
                ? await addSiteAdmin(project, email, ctx.context, ctx.logger)
                : await removeSiteAdmin(project, email, ctx.context, ctx.logger);
            return asText(result);
        },
    );

    server.registerTool(
        'repair_site_configuration',
        {
            title: 'Repair Site Configuration',
            description:
                "Re-run the Configuration Service registration for the current project's storefront " +
                '— the write that fails when the caller holds no admin role, leaving a storefront ' +
                'that builds but serves no product pages. Requires confirm:true. Does NOT publish; ' +
                'call republish afterwards.',
            inputSchema: {
                confirm: z
                    .boolean()
                    .optional()
                    .describe(
                        'Must be true — the write re-mints the site publish key and can drop admin ' +
                            'grants that cannot be restored; ask the user first',
                    ),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) {
                return asText({
                    error:
                        'repair_site_configuration requires confirm:true — it rewrites the site ' +
                        'configuration and re-mints its publish key. Ask the user first.',
                });
            }
            const ctx = ctxFactory();
            const project = await ctx.stateManager.getCurrentProject();
            if (!project) {
                return asText({ error: 'No current project is open' });
            }

            const result = await repairSiteConfigForProject(project, ctx.context, ctx.logger);

            // Say what remains rather than reporting a bare success. A registration
            // that has not been republished changes nothing a visitor can see, and
            // an agent that stopped here would report the storefront fixed.
            return asText({
                ...result,
                ...(result.status === 'repaired' && { nextStep: 'republish' }),
            });
        },
    );

    server.registerTool(
        'connect_dalive',
        {
            title: 'Connect DA.live',
            description:
                'Sign in to DA.live, which every storefront content and site-config operation ' +
                'authorizes as. Hands back to the user — the credential comes from a bookmarklet ' +
                'and a paste, which no tool can perform.',
            inputSchema: {},
        },
        async () =>
            // ALWAYS a handoff. The bookmarklet runs in the user's own browser
            // session and yields a token they paste in; there is no argument this
            // tool could take that would not be a secret travelling as a tool
            // argument.
            //
            // No confirm gate: this opens nothing and changes nothing.
            asText(
                needsUser({
                    reason: 'secret-entry',
                    what: 'Sign in to DA.live',
                    where: { command: 'demoBuilder.openDaLiveBookmarkletSetup' },
                    tellUser:
                        'DA.live sign-in uses a bookmarklet: run "Demo Builder: DA.live Bookmarklet ' +
                        'Setup" from the command palette, follow the setup page to add the ' +
                        'bookmark, then click it while signed in to da.live and paste the token ' +
                        'back into VS Code. Nothing has been changed by this call.',
                    resumeWith: 'get_auth_status',
                }),
            ),
    );
}
