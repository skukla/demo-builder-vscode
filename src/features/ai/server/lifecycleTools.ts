/**
 * Lifecycle tools (Phase 4, Group 5) — the two that cannot be descriptor rows.
 *
 * `open_url` opens one of the CURRENT project's own URLs in the browser, and
 * `edit_project` hands the wizard back to the user. Both need something a
 * `{map, type}` row cannot express: the first resolves a target across a handler
 * boundary before acting, the second never dispatches at all.
 *
 * ## `open_url` takes a TARGET, never a URL
 *
 * The obvious shape — `open_url(url)` — would let an agent point the user's
 * browser at any address it liked, and no validation makes that safe, because
 * the danger is not a malformed URL but a well-formed one nobody asked for. So
 * the argument names WHICH of the project's URLs to open and the extension
 * resolves it, which means the set of reachable destinations is exactly the set
 * `get_project_urls` already reports. The two tools share one resolver — the
 * `getProjectUrls` handler — so a target can never resolve differently here than
 * in the read the agent used to choose it.
 *
 * That closes the gap this group was named for: `get_project_urls` returned URLs
 * and nothing could act on one.
 *
 * ## Both are confirm-gated, for the same reason `open_view` is
 *
 * No tool takes over the user's screen unsolicited. Opening a browser window is
 * that, and so is opening the creation wizard.
 */

import { z } from 'zod';
import { needsUser } from './handoff';
import { dispatchHandler } from '@/core/handlers';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import type { HandlerContext } from '@/types/handlers';

/**
 * The targets `handleGetProjectUrls` can report, and therefore the only ones
 * openable here.
 *
 * Kept as a literal rather than derived from a live call: the enum has to exist
 * at REGISTRATION time, before any project is loaded, and a project missing a
 * URL must still advertise the target so the refusal can say it is unset rather
 * than that it is unknown. The pairing is asserted in the tool's tests against
 * the handler's own output.
 */
const URL_TARGETS = ['storefront', 'liveSite', 'daLive', 'commerceAdmin', 'devConsole'] as const;

const TARGET_HINTS: Record<(typeof URL_TARGETS)[number], string> = {
    storefront: 'the local dev storefront — only while the demo is running',
    liveSite: 'the published EDS site (EDS projects only)',
    daLive: 'the DA.live authoring surface (EDS projects only)',
    commerceAdmin: 'the Commerce admin panel',
    devConsole: 'the Adobe Developer Console for this workspace',
};

const asText = (value: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
});

/**
 * Register `open_url` and `edit_project`.
 *
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext per call.
 * @param openUrl    Opens a URL in the user's browser (injected from
 *   `extension.ts` so this module carries no vscode import, matching viewTools).
 */
export function registerLifecycleTools(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    ctxFactory: () => HandlerContext,
    openUrl: (url: string) => Promise<unknown>,
): void {
    server.registerTool(
        'open_url',
        {
            title: 'Open Project URL',
            description:
                "Open one of the CURRENT project's URLs in the browser. The target names which " +
                'one (see get_project_urls for what is set); arbitrary URLs are not accepted. ' +
                'Requires confirm:true — it takes over the screen.',
            inputSchema: {
                target: z
                    .enum(URL_TARGETS)
                    .describe(
                        Object.entries(TARGET_HINTS)
                            .map(([key, hint]) => `${key} = ${hint}`)
                            .join('; '),
                    ),
                confirm: z
                    .boolean()
                    .optional()
                    .describe('Must be true — this opens a browser window; ask the user first'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) {
                return asText({
                    error: 'open_url requires confirm:true — it opens a browser window. Ask the user first.',
                });
            }
            const target = args.target as (typeof URL_TARGETS)[number];

            // The SAME resolver get_project_urls uses, so the target an agent read
            // there is the target opened here. Re-deriving it would be a second
            // implementation of one fact.
            const res = await dispatchHandler(dashboardHandlers, ctxFactory(), 'getProjectUrls', {});
            if (!res.success) {
                return asText({ error: res.error ?? 'Could not resolve the project URLs.' });
            }

            const urls = (res.data as { urls?: Record<string, string> } | undefined)?.urls ?? {};
            const url = urls[target];
            if (!url) {
                // Name what IS available rather than only what is not: an agent
                // that picked a target this project does not have needs the list,
                // and it is already in hand.
                return asText({
                    error: `This project has no ${target} URL (${TARGET_HINTS[target]}).`,
                    available: Object.keys(urls),
                });
            }

            await openUrl(url);
            return asText({ opened: target, url });
        },
    );

    server.registerTool(
        'edit_project',
        {
            title: 'Edit Project',
            description:
                "Open the creation wizard in edit mode on the current project, for changes the " +
                'configure_project tool cannot make (package, stack, storefront repo). Hands back ' +
                'to the user — the wizard is theirs to drive; nothing is changed by this call.',
            inputSchema: {},
        },
        async () =>
            // ALWAYS a handoff, never a dispatch. `handleEditProject` opens the
            // wizard webview and returns success — reached from an agent that is a
            // panel appearing for a call the user did not make, reported as though
            // work happened. The wizard is a multi-step human surface; there is no
            // version of this an agent finishes.
            //
            // No confirm gate: this opens nothing, so there is nothing to gate.
            asText(
                needsUser({
                    reason: 'settings-edit',
                    what: 'Edit this project in the Demo Builder wizard',
                    where: { command: 'demoBuilder.createProject' },
                    tellUser:
                        'Changing the demo package, stack or storefront repo happens in the ' +
                        'creation wizard, which opens on this project in edit mode. Run "Demo ' +
                        'Builder: Create Project" from the dashboard\'s Edit action and step ' +
                        'through it. For env vars, store scope, block libraries, addons and the ' +
                        'datapack, ask me instead — configure_project covers those without the ' +
                        'wizard. Nothing has been changed by this call.',
                    resumeWith: 'get_project',
                }),
            ),
    );
}
