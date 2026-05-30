/**
 * Auth tools (Phase 3a) — status + interactive sign-in handoff.
 *
 * `get_auth_status` reports Adobe/GitHub/DA.live auth WITHOUT side effects, so an
 * agent can pre-flight before a long operation. `sign_in` performs the
 * interactive login (which opens a browser / VS Code auth UI) and is gated on
 * `confirm:true` — the agent asks the user before a browser opens.
 *
 * These are curated adapters (not thin proxies): the existing check/authenticate
 * HANDLERS communicate via `sendMessage` to the webview, so we call the SERVICES
 * directly and return structured results instead.
 */

import { z } from 'zod';
import { dispatchHandler } from '@/core/handlers';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import type { HandlerContext } from '@/types/handlers';

interface ProviderStatus {
    authenticated: boolean;
    /** Minutes until the Adobe token expires (negative if expired). Adobe only. */
    expiresInMinutes?: number;
    /** Set when the status could not be determined (e.g. EDS services unavailable). */
    error?: string;
}

async function adobeStatus(ctx: HandlerContext): Promise<ProviderStatus> {
    if (!ctx.authManager) return { authenticated: false, error: 'auth service unavailable' };
    const status = await ctx.authManager.getTokenStatus();
    return { authenticated: status.isAuthenticated, expiresInMinutes: status.expiresInMinutes };
}

async function safeStatus(fn: () => Promise<ProviderStatus>): Promise<ProviderStatus> {
    try {
        return await fn();
    } catch (err) {
        return { authenticated: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Register `get_auth_status` and `sign_in`.
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext per call.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerAuthTools(server: any, ctxFactory: () => HandlerContext): void {
    server.registerTool(
        'get_auth_status',
        {
            title: 'Get Auth Status',
            description: 'Report Adobe / GitHub / DA.live authentication status (no side effects)',
            inputSchema: {},
        },
        async () => {
            const ctx = ctxFactory();
            const adobe = await safeStatus(() => adobeStatus(ctx));
            const github = await safeStatus(async () => ({
                authenticated: (await getGitHubServices(ctx).tokenService.validateToken()).valid,
            }));
            const dalive = await safeStatus(async () => ({
                authenticated: await getDaLiveAuthService(ctx.context).isAuthenticated(),
            }));
            return { content: [{ type: 'text' as const, text: JSON.stringify({ adobe, github, dalive }) }] };
        },
    );

    server.registerTool(
        'sign_in',
        {
            title: 'Sign In',
            description: 'Open an interactive sign-in to refresh an expired session (opens a browser). Requires confirm:true',
            inputSchema: {
                provider: z.enum(['adobe', 'github', 'dalive']).describe('Which service to sign in to'),
                confirm: z.boolean().optional().describe('Must be true — this opens a browser / auth window'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: 'sign_in requires confirm:true — it opens a browser/auth window. Ask the user to confirm first.',
                        },
                    ],
                };
            }
            const ctx = ctxFactory();
            const provider = args.provider as 'adobe' | 'github' | 'dalive';

            if (provider === 'adobe') {
                const ok = (await ctx.authManager?.login()) ?? false;
                return { content: [{ type: 'text' as const, text: JSON.stringify({ provider, success: ok }) }] };
            }
            if (provider === 'github') {
                const res = await dispatchHandler(edsHandlers, ctx, 'github-oauth', {});
                return { content: [{ type: 'text' as const, text: JSON.stringify({ provider, success: res.success }) }] };
            }
            // dalive — opens the DA.live login/bookmarklet page; the token paste
            // still happens in VS Code (DA.live has no headless token grant).
            const res = await dispatchHandler(edsHandlers, ctx, 'open-dalive-login', {});
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify({
                            provider,
                            success: res.success,
                            note: 'Finish the DA.live token paste in VS Code, then retry.',
                        }),
                    },
                ],
            };
        },
    );
}
