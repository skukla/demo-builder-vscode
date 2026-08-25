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
 * ## The migration pair is split for a different reason than the access pair
 *
 * The `Migrate Storefront Names` command sweeps EVERY project and migrates them
 * all behind one modal. That shape cannot carry the name echo this group's
 * conventions require for an irreversible action — there is no single name to
 * echo — and it would hand an agent a single call that deletes N DA.live site
 * roots. So the sweep becomes a read (`find_storefront_name_mismatches`) and
 * the migration addresses one project at a time. Looping is what an agent is
 * good at; a bulk destructive call is not what it should be handed.
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
import { AGENT_PAGE_SIZE } from './projectors';
import { phaseReporter } from '@/core/utils/agentPhaseChannel';
import { repairSiteConfigForProject } from '@/features/eds/services/configService/repairSiteConfigForProject';
import {
    addSiteAdmin,
    listSiteAccess,
    removeSiteAdmin,
} from '@/features/eds/services/configService/siteAccessManagerHeadless';
import {
    findStorefrontNameMismatch,
    migrateStorefrontNameForProject,
} from '@/features/eds/services/storefront/storefrontNameMigrationForProject';
import type { Project } from '@/types';
import type { HandlerContext } from '@/types/handlers';
import { isEdsProject } from '@/types/typeGuards';

/**
 * Register the storefront-site tools on `server`: the site-access pair, the
 * config repair, the storefront-name migration pair, and the DA.live handoff.
 *
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext for each invocation.
 */
/**
 * Site configuration is an EDS concept — a Configuration Service entry keyed by
 * the storefront's GitHub owner/repo. A headless project has none, so these tools
 * cannot answer for it.
 *
 * Without this, `repair_site_configuration` on a headless project passed its
 * confirm gate and called straight into the repair path with nothing to repair.
 * Added 2026-08-24 after a sweep: `storefrontTools` already guarded exactly this
 * ("republish applies only to EDS storefront projects") and these did not, so the
 * rule was per-author rather than per-surface. Wording kept identical so the two
 * files read as one policy.
 *
 * Returns the refusal to send, or undefined when the project is EDS.
 */
function refuseIfNotEds(project: Project, tool: string): { error: string } | undefined {
    return isEdsProject(project)
        ? undefined
        : { error: `${tool} applies only to EDS storefront projects` };
}

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
            const wrongShape = refuseIfNotEds(project, 'get_site_access');
            if (wrongShape) return asText(wrongShape);
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
                admin: z.boolean().describe('true grants the admin role, false revokes it'),
                confirm: z
                    .boolean()
                    .optional()
                    .describe(
                        'Must be true — this changes access for another person; ask the user first',
                    ),
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

            const wrongShape = refuseIfNotEds(project, 'set_site_admin');
            if (wrongShape) return asText(wrongShape);

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
                'that builds but serves no product pages. On a legacy project whose DA.live site ' +
                'name differs from the repo name, this first migrates the name (renames the DA ' +
                'site, deletes the old site root). Requires confirm:true. Does NOT publish; ' +
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

            const wrongShape = refuseIfNotEds(project, 'repair_site_configuration');
            if (wrongShape) return asText(wrongShape);

            const result = await repairSiteConfigForProject(
                project,
                ctx.context,
                ctx.logger,
                (p) => ctx.stateManager.saveProject(p),
                phaseReporter(),
            );

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
        'find_storefront_name_mismatches',
        {
            title: 'Find Storefront Name Mismatches',
            description:
                'Projects whose DA.live site name does not match their GitHub repo name — a legacy ' +
                'defect in storefronts created by older builds. Read-only; migrate_storefront_name ' +
                'fixes one.',
            inputSchema: {},
        },
        async () => {
            const ctx = ctxFactory();
            const summaries = await ctx.stateManager.getAllProjects();
            const mismatches = [];

            for (const summary of summaries) {
                try {
                    // persistAfterLoad: false — this is a read. A scan that
                    // rewrote every manifest it inspected would be a write
                    // hiding in a read, which the tool conventions forbid.
                    const project = await ctx.stateManager.loadProjectFromPath(
                        summary.path,
                        () => [],
                        { persistAfterLoad: false },
                    );
                    if (!project) continue;

                    const found = findStorefrontNameMismatch(project);
                    if (found) {
                        mismatches.push({
                            project: found.projectName,
                            projectPath: found.projectPath,
                            from: `${found.daLiveOrg}/${found.daLiveSite}`,
                            to: `${found.daLiveOrg}/${found.repoName}`,
                        });
                    }
                } catch (error) {
                    // One unreadable manifest must not hide every other
                    // mismatch — the command skips it too.
                    ctx.logger.warn(
                        `[find_storefront_name_mismatches] skipped ${summary.name}: ` +
                            `${(error as Error).message}`,
                    );
                }
            }

            // Paged even though a mismatch list is legacy-bounded and small
            // today. "Naturally small" is the assumption that let
            // list_adobe_projects return 725 rows.
            return asText({
                scanned: summaries.length,
                total: mismatches.length,
                mismatches: mismatches.slice(0, AGENT_PAGE_SIZE),
            });
        },
    );

    server.registerTool(
        'migrate_storefront_name',
        {
            title: 'Migrate Storefront Name',
            description:
                "Rename ONE project's DA.live site to match its GitHub repo name, preserving all " +
                'content. **Destructive** — it deletes the old DA.live site root. Requires ' +
                'confirm:true and confirmName equal to the project name. Find candidates with ' +
                'find_storefront_name_mismatches.',
            inputSchema: {
                projectPath: z.string().describe('Absolute path of the project to migrate'),
                confirm: z.boolean().optional().describe('Must be true to proceed'),
                confirmName: z
                    .string()
                    .optional()
                    .describe(
                        'Must equal the project name exactly — guards the old site root deletion',
                    ),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const projectPath = String(args?.projectPath ?? '').trim();
            if (!projectPath) {
                return asText({ error: 'projectPath is required' });
            }

            const ctx = ctxFactory();
            const project = await ctx.stateManager.loadProjectFromPath(projectPath, () => [], {
                persistAfterLoad: false,
            });
            if (!project) {
                return asText({ error: `No project found at ${projectPath}` });
            }

            const candidate = findStorefrontNameMismatch(project);
            if (!candidate) {
                // Not an error state. A project whose names already match is the
                // desired outcome, and saying "nothing to do" is what lets an
                // agent loop over the list without treating each no-op as a
                // failure.
                return asText({
                    migrated: false,
                    project: project.name,
                    reason: 'This project has no storefront-name mismatch.',
                });
            }

            // The echo is the project NAME rather than the site name: it is what
            // find_storefront_name_mismatches reports first and what the user
            // recognises. The site names are in `from`/`to` on that same row.
            if (args?.confirm !== true || args?.confirmName !== candidate.projectName) {
                return asText({
                    error:
                        `migrate_storefront_name deletes the old DA.live site root ` +
                        `${candidate.daLiveOrg}/${candidate.daLiveSite}. To proceed, call again with ` +
                        `confirm:true and confirmName:"${candidate.projectName}".`,
                    irreversible: true,
                    from: `${candidate.daLiveOrg}/${candidate.daLiveSite}`,
                    to: `${candidate.daLiveOrg}/${candidate.repoName}`,
                });
            }

            const result = await migrateStorefrontNameForProject(
                candidate,
                ctx.context,
                ctx.logger,
                (updated) => ctx.stateManager.saveProject(updated),
                phaseReporter(),
            );

            return asText({
                migrated: result.migrated,
                project: candidate.projectName,
                from: `${candidate.daLiveOrg}/${candidate.daLiveSite}`,
                to: `${candidate.daLiveOrg}/${candidate.repoName}`,
                // Reported, never assumed: a migrated storefront whose key was
                // not re-minted cannot publish, and that is invisible until
                // someone tries.
                publishKeyRenewed: result.publishKeyRenewed,
                ...(result.error && { error: result.error }),
                // Masked already by the migration. Surfaced because nothing in
                // the app can restore them, and these legacy storefronts are the
                // ones most likely to have several admins.
                ...(result.lostGrants?.length && { lostGrants: result.lostGrants }),
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
