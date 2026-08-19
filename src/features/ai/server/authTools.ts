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
import { clearAdobeTarget } from './adobeTargetStore';
import { asRawText, asText } from './mcpToolResult';
import { dispatchHandler } from '@/core/handlers';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import {
    getDaLiveAuthService,
    getGitHubServices,
    showDaLiveAuthQuickPick,
} from '@/features/eds/handlers/edsHelpers';
import type { HandlerContext } from '@/types/handlers';

interface ProviderStatus {
    authenticated: boolean;
    /** Minutes until the Adobe token expires (negative if expired). Adobe only. */
    expiresInMinutes?: number;
    /** GitHub only: the authenticated username. */
    login?: string;
    /** GitHub only: orgs this user belongs to — the namespaces a repo can be created in. */
    orgs?: string[];
    /** DA.live only: the pinned namespace every DA.live write targets. */
    orgName?: string;
    /** Set when the status could not be determined (e.g. EDS services unavailable). */
    error?: string;
}

/**
 * GitHub identity, WITHOUT adopting a VS Code session.
 *
 * Deliberately not `handleCheckGitHubAuth`, the wizard's equivalent: on finding a
 * VS Code GitHub session that handler calls `tokenService.storeToken(...)`
 * (`edsGitHubHandlers.ts:79-83`), persisting a credential. Correct mid-setup,
 * wrong under a `get_*` name — an agent pre-flighting auth would silently adopt a
 * session into extension storage. Reading the services reports only what is
 * already stored, and writes nothing.
 *
 * `orgs` earns its place beyond diagnostics: a repo can only be created in a
 * namespace the user belongs to, and nothing else on the agent surface exposes
 * that list.
 */
async function githubStatus(ctx: HandlerContext): Promise<ProviderStatus> {
    const { tokenService } = getGitHubServices(ctx);
    const validation = await tokenService.validateToken();
    if (!validation.valid) return { authenticated: false };

    // Orgs are ENRICHMENT, so their failure must not unseat the answer. Folding
    // this call into the outer `safeStatus` would report `authenticated: false`
    // for a perfectly valid token whose org lookup happened to fail — turning a
    // missing nice-to-have into a wrong verdict on the question actually asked.
    let orgs: string[] | undefined;
    try {
        orgs = await tokenService.getUserOrgs();
    } catch {
        orgs = undefined;
    }

    return {
        authenticated: true,
        login: validation.user?.login,
        ...(orgs ? { orgs } : {}),
    };
}

/**
 * DA.live status plus the pinned namespace.
 *
 * `orgName` is reachable nowhere else on the agent surface, so it is reported
 * here or not at all.
 *
 * It is NOT what DA.live writes target — those read the project's own
 * `daLiveOrg` off its EDS component metadata (`storefrontRepublishService.ts`,
 * `extractRepublishParams`). This value is the namespace the last sign-in
 * pinned; it survives token expiry and only an explicit logout clears it, which
 * is why the sign-in flow reuses it instead of re-asking. Its three readers are
 * this tool, the webview auth status, and that skip check — nothing else.
 *
 * An earlier version of this comment claimed every DA.live write targets it.
 * That was never true, and it is the kind of claim nothing checks: no compiler,
 * no test, no scan.
 */
async function daLiveStatus(ctx: HandlerContext): Promise<ProviderStatus> {
    const service = getDaLiveAuthService(ctx.context);
    const authenticated = await service.isAuthenticated();
    const orgName = service.getOrgName();
    return { authenticated, ...(orgName ? { orgName } : {}) };
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
            description:
                'Report Adobe / GitHub / DA.live authentication status, with the GitHub user + orgs a repo can be created in, and the pinned DA.live namespace. No side effects.',
            inputSchema: {},
        },
        async () => {
            const ctx = ctxFactory();
            const adobe = await safeStatus(() => adobeStatus(ctx));
            const github = await safeStatus(() => githubStatus(ctx));
            const dalive = await safeStatus(() => daLiveStatus(ctx));
            return asText({ adobe, github, dalive });
        },
    );

    server.registerTool(
        'sign_in',
        {
            title: 'Sign In',
            description:
                'Open an interactive sign-in to refresh an expired session (opens a browser). Requires confirm:true',
            inputSchema: {
                provider: z
                    .enum(['adobe', 'github', 'dalive'])
                    .describe('Which service to sign in to'),
                confirm: z
                    .boolean()
                    .optional()
                    .describe('Must be true — this opens a browser / auth window'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) {
                return asRawText(
                    'sign_in requires confirm:true — it opens a browser/auth window. Ask the user to confirm first.',
                );
            }
            const ctx = ctxFactory();
            const provider = args.provider as 'adobe' | 'github' | 'dalive';

            if (provider === 'adobe') {
                // A re-auth may switch to a different account, so drop the prior
                // identity's MCP target — otherwise list/select tools would keep
                // targeting the previous account's org/project/workspace.
                clearAdobeTarget();
                const ok = (await ctx.authManager?.login()) ?? false;
                return asText({ provider, success: ok });
            }
            if (provider === 'github') {
                const res = await dispatchHandler(edsHandlers, ctx, 'github-oauth', {});
                return asText({ provider, success: res.success });
            }
            // dalive — DA.live has no headless token grant, so sign-in completes
            // through native VS Code prompts (open browser → paste token → org).
            // Use showDaLiveAuthQuickPick directly: it collects the token via
            // vscode.window.showInputBox (no webview). The 'open-dalive-login'
            // handler can't be used from here — it posts the paste UI to a webview,
            // and the agent's headless context drops sendMessage, so the input box
            // never appears.
            const res = await showDaLiveAuthQuickPick(ctx);
            return asText({
                provider,
                success: res.success,
                cancelled: res.cancelled ?? false,
                note: res.success
                    ? 'DA.live sign-in complete.'
                    : 'DA.live sign-in was cancelled or failed; re-run sign_in to retry.',
            });
        },
    );
}
