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

import * as vscode from 'vscode';
import { z } from 'zod';
import { clearAdobeTarget } from './adobeTargetStore';
import { asRawText, asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { dispatchHandler } from '@/core/handlers/dispatchHandler';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import {
    getDaLiveAuthService,
    getGitHubServices,
    showDaLiveAuthQuickPick,
} from '@/features/eds/handlers/edsHelpers';
import { GITHUB_SCOPES } from '@/features/eds/services/types';
import type { HandlerContext } from '@/types/handlers';

interface ProviderStatus {
    authenticated: boolean;
    /** Minutes until the Adobe token expires (negative if expired). Adobe only. */
    expiresInMinutes?: number;
    /** GitHub only: the authenticated username. */
    login?: string;
    /** GitHub only: orgs this user belongs to — the namespaces a repo can be created in. */
    orgs?: string[];
    /** GitHub only: where the credential lives — 'stored-token' (extension storage) or
     * 'vscode-session' (VS Code's account system; adopted by GitHub operations on use). */
    via?: 'stored-token' | 'vscode-session';
    /** GitHub only, when unauthenticated: why `false` may not mean "signed out". */
    note?: string;
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
 * session into extension storage. Reading here reports the stored token, and
 * falls back to a SILENT VS Code session read (no prompt, no adoption) —
 * writes nothing either way.
 *
 * `orgs` earns its place beyond diagnostics: a repo can only be created in a
 * namespace the user belongs to, and nothing else on the agent surface exposes
 * that list.
 */
async function githubStatus(ctx: HandlerContext): Promise<ProviderStatus> {
    const { tokenService } = getGitHubServices(ctx.context.secrets);
    const validation = await tokenService.validateToken();
    if (!validation.valid) return githubVsCodeSessionStatus();

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
        via: 'stored-token',
        login: validation.user?.login,
        ...(orgs ? { orgs } : {}),
    };
}

/**
 * No stored token — ask VS Code's account system, SILENTLY (no prompt, no
 * adoption, no storage; the wizard's `handleCheckGitHubAuth` is the path that
 * adopts). Twice an agent read a bare `authenticated: false` here as "signed
 * out" and recommended a needless sign-in; VS Code holding the session is the
 * common case, so the answer must say where the credential actually lives.
 */
async function githubVsCodeSessionStatus(): Promise<ProviderStatus> {
    let session: vscode.AuthenticationSession | undefined;
    try {
        session = await vscode.authentication.getSession('github', [...GITHUB_SCOPES], {
            createIfNone: false,
            silent: true,
        });
    } catch {
        session = undefined;
    }
    if (session) {
        return { authenticated: true, via: 'vscode-session', login: session.account.label };
    }
    return {
        authenticated: false,
        note:
            'No stored token and no silently-readable VS Code session. GitHub auth is ' +
            'managed by VS Code and adopted when a GitHub operation runs — this does ' +
            'not necessarily mean the user must sign in.',
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
export function registerAuthTools(server: McpToolServer, ctxFactory: () => HandlerContext): void {
    server.registerTool(
        'get_auth_status',
        {
            annotations: { readOnlyHint: true, destructiveHint: false },
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
            // NOT read-only: writes credentials and opens an auth window.
            annotations: { readOnlyHint: false, destructiveHint: false },
            title: 'Sign In',
            description:
                'Open an interactive sign-in to refresh an expired session (opens a browser). ' +
                'Requires confirm:true. For provider "dalive" it returns immediately after ' +
                'opening the prompts — poll get_auth_status until dalive.authenticated is true.',
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
            // through native VS Code prompts: namespace (skipped when one is
            // already pinned) → open browser → token, taken from the clipboard
            // when it holds a DA.live one and from an input box otherwise.
            // Use showDaLiveAuthQuickPick directly; the 'open-dalive-login'
            // handler can't be used from here — it posts the paste UI to a webview,
            // and the agent's headless context drops sendMessage, so the prompt
            // never appears.
            //
            // Deliberately NOT awaited: the flow blocks for as long as the human
            // takes, and awaiting it here meant the agent's client saw only a 60s
            // timeout while the user saw "nothing happens" (the QuickPick can
            // also dismiss on focus loss). The tool answers immediately with
            // instructions; the agent polls get_auth_status for completion, and
            // the eventual outcome lands in the window (observed live
            // 2026-08-23 — the item this fixes).
            vscode.window.setStatusBarMessage(
                '$(key) Demo Builder: an agent requested DA.live sign-in — complete the prompts in this window',
                TIMEOUTS.STATUS_BAR_SUCCESS,
            );
            void showDaLiveAuthQuickPick(ctx).then(
                (res) => {
                    if (res.success) {
                        vscode.window.setStatusBarMessage(
                            '$(check) DA.live sign-in complete',
                            TIMEOUTS.STATUS_BAR_SUCCESS,
                        );
                    }
                },
                () => undefined,
            );
            return asText({
                provider,
                started: true,
                note:
                    'DA.live sign-in prompts opened in the VS Code window — the user must ' +
                    'complete them there (no headless grant exists). Poll get_auth_status ' +
                    'until dalive.authenticated is true before continuing.',
            });
        },
    );
}
