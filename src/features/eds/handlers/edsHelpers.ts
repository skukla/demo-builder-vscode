/**
 * EDS Helpers
 *
 * Helper functions for EDS handlers, extracted from edsHandlers.ts for better modularity.
 *
 * Contains:
 * - Service instance cache management (getGitHubServices, getDaLiveAuthService)
 * - clearServiceCache for cleanup
 * - validateDaLiveToken for JWT validation
 * - showDaLiveAuthQuickPick for dashboard re-authentication
 *
 * @module features/eds/handlers/edsHelpers
 */

import * as vscode from 'vscode';
import { DaLiveAuthService, parseJwtPayload } from '../services/daLiveAuthService';
import { DaLiveConfigService } from '../services/daLiveConfigService';
import { DaLiveContentOperations,
    createDaLiveServiceTokenProvider,
} from '../services/daLiveContentOperations';
import { type TokenProvider } from '../services/daLiveOrgOperations';
import { GitHubFileOperations } from '../services/githubFileOperations';
import { GitHubOAuthService } from '../services/githubOAuthService';
import { GitHubRepoOperations } from '../services/githubRepoOperations';
import { GitHubTokenService } from '../services/githubTokenService';
import { HelixService } from '../services/helixService';
import { COMPONENT_IDS } from '@/core/constants';
import { getLogger } from '@/core/logging';
import { maskEmail, redactUrlUserParam } from '@/core/utils/maskEmail';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AuthoringExperience, Project } from '@/types';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

// ==========================================================
// Service Instance Cache
// ==========================================================

/**
 * GitHub Services - composed from extracted modules
 */
export interface GitHubServices {
    tokenService: GitHubTokenService;
    repoOperations: GitHubRepoOperations;
    fileOperations: GitHubFileOperations;
    oauthService: GitHubOAuthService;
}

/** Cached GitHub services (per extension context) */
let cachedGitHubServices: GitHubServices | null = null;

/** Cached DaLiveAuthService instance (for darkalley OAuth) */
let cachedDaLiveAuthService: DaLiveAuthService | null = null;

/**
 * Get or create GitHub services
 * Returns all GitHub-related services with explicit dependencies
 */
export function getGitHubServices(context: HandlerContext): GitHubServices {
    const logger = getLogger();
    if (!cachedGitHubServices) {
        logger.debug('[EDS:ServiceCache] Creating NEW GitHub services (no cache)');
        const tokenService = new GitHubTokenService(context.context.secrets, logger);
        const repoOperations = new GitHubRepoOperations(tokenService, logger);
        const fileOperations = new GitHubFileOperations(tokenService, logger);
        const oauthService = new GitHubOAuthService(context.context.secrets, logger);

        cachedGitHubServices = {
            tokenService,
            repoOperations,
            fileOperations,
            oauthService,
        };
        logger.debug('[EDS:ServiceCache] GitHub services created and cached');
    } else {
        logger.debug('[EDS:ServiceCache] Returning CACHED GitHub services');
    }
    return cachedGitHubServices;
}

/**
 * Get or create DaLiveAuthService instance (for darkalley OAuth).
 * Accepts ExtensionContext directly so callers without HandlerContext can use it.
 */
export function tryCreateDaLiveTokenProvider(
    extensionContext: vscode.ExtensionContext | undefined,
): { getAccessToken(): Promise<string | null | undefined> } | undefined {
    // Non-fatal by design. The DA.live session is needed only for sites carrying
    // an `access.admin` role; an unprotected site works without it, so a partial
    // or absent ExtensionContext (headless, MCP, a test harness) must degrade to
    // the previous behaviour rather than break a check that used to succeed.
    if (!extensionContext) return undefined;
    try {
        return createDaLiveServiceTokenProvider(getDaLiveAuthService(extensionContext));
    } catch {
        return undefined;
    }
}

export function getDaLiveAuthService(extensionContext: vscode.ExtensionContext): DaLiveAuthService {
    // Initialize Helix key persistence alongside DA.live auth (idempotent).
    // Fire-and-forget: secretStorage ref is set synchronously, migration runs async.
    void HelixService.initKeyStore(extensionContext.secrets, extensionContext.globalState);
    if (!cachedDaLiveAuthService) {
        cachedDaLiveAuthService = new DaLiveAuthService(extensionContext);
    }
    return cachedDaLiveAuthService;
}

/**
 * Clear cached service instances
 *
 * Call this when extension is deactivated to clean up resources.
 */
export function clearServiceCache(): void {
    const logger = getLogger();
    logger.debug('[EDS:ServiceCache] CLEARING all service caches', {
        hadGitHubServices: !!cachedGitHubServices,
        hadDaLiveAuthService: !!cachedDaLiveAuthService,
        timestamp: new Date().toISOString(),
    });
    cachedGitHubServices = null;
    if (cachedDaLiveAuthService) {
        cachedDaLiveAuthService.dispose();
        cachedDaLiveAuthService = null;
    }
    logger.debug('[EDS:ServiceCache] All service caches cleared');
}

/** Library pages published concurrently per batch — the admin API is rate-sensitive. */
const LIBRARY_PUBLISH_BATCH = 5;

// ==========================================================
// Token Validation
// ==========================================================

/**
 * Result of DA.live token validation
 */
export interface DaLiveTokenValidationResult {
    /** Whether the token is valid */
    valid: boolean;
    /** Error message if validation failed */
    error?: string;
    /** Email extracted from token payload */
    email?: string;
    /** Token expiration timestamp (ms since epoch) */
    expiresAt?: number;
}

/**
 * Validate a DA.live JWT token
 *
 * Checks:
 * - JWT format (starts with "eyJ")
 * - Token expiry (if created_at and expires_in are present)
 * - Client ID (must be "darkalley" if present)
 *
 * Extracts:
 * - email (or preferred_username as fallback)
 * - expiresAt timestamp
 *
 * @param token - JWT token string to validate
 * @returns Validation result with extracted info
 */
export function validateDaLiveToken(token: string): DaLiveTokenValidationResult {
    // Check JWT format (must start with eyJ for valid base64-encoded JSON header)
    if (!token || !token.startsWith('eyJ')) {
        return {
            valid: false,
            error: 'Invalid token format. Please copy the complete token.',
        };
    }

    // Try to decode and validate the token
    const payload = parseJwtPayload(token);
    if (payload) {
        // Extract email (prefer email field, fallback to preferred_username)
        const email = (payload.email || payload.preferred_username) as string | undefined;

        // Calculate expiry from created_at + expires_in
        let expiresAt: number | undefined;
        if (payload.created_at && payload.expires_in) {
            const createdAt = parseInt(String(payload.created_at), 10);
            const expiresIn = parseInt(String(payload.expires_in), 10);
            expiresAt = createdAt + expiresIn;

            // Check if token has expired
            if (Date.now() > expiresAt) {
                return {
                    valid: false,
                    error: 'Token has expired. Please get a fresh token from DA.live.',
                };
            }
        }

        // Verify it's a darkalley token (DA.live client)
        if (payload.client_id && payload.client_id !== 'darkalley') {
            return {
                valid: false,
                error: 'This token is not from DA.live. Please use the bookmarklet on da.live.',
            };
        }

        return {
            valid: true,
            email,
            expiresAt,
        };
    }

    // Token format is valid but couldn't extract details
    return {
        valid: true,
    };
}

// ==========================================================
// BYOM Overlay URL resolution
// ==========================================================

const BYOM_MAX_URL_LENGTH = 2048;
const BYOM_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Resolve the BYOM (Bring Your Own Markup) overlay URL with this precedence:
 *   1. VS Code setting `demoBuilder.byom.overlayUrl` (trimmed, non-empty, valid URL,
 *      `https://` scheme or `http://` on a loopback host, ≤ 2048 chars).
 *   2. `fromConfig` parameter (a fallback usually sourced from demo-packages.json).
 *   3. undefined.
 *
 * Invalid setting values log a fingerprint-only warning (raw URL is not logged,
 * to avoid leaking secrets that may appear in query strings) and fall through
 * to `fromConfig`.
 *
 * Used by storefront create, storefront reset, and the AI tool reset path so
 * every EDS create/recreate registers the same overlay against the AEM
 * Configuration Service when the SC has configured one.
 *
 * @param fromConfig - Optional URL from demo-packages.json or similar config
 * @returns The resolved URL, or undefined when none resolves
 */
export function resolveByomOverlayUrl(fromConfig?: string): string | undefined {
    const raw = vscode.workspace.getConfiguration('demoBuilder.byom').get<string>('overlayUrl', '');
    // VS Code's typed `get<string>` returns the default on type mismatch, but
    // be defensive about non-string values (corrupted user settings.json).
    const trimmed = typeof raw === 'string' ? raw.trim() : '';

    if (trimmed.length > 0) {
        const valid = trimmed.length <= BYOM_MAX_URL_LENGTH && isAcceptedOverlayUrl(trimmed);
        if (valid) {
            return trimmed;
        }
        getLogger().warn(
            `[BYOM] Ignoring invalid demoBuilder.byom.overlayUrl setting (${describeRejectedUrl(trimmed)}). Expected https:// (or http://localhost for local dev), max ${BYOM_MAX_URL_LENGTH} chars.`,
        );
        // fall through to fromConfig
    }

    return fromConfig && fromConfig.length > 0 ? fromConfig : undefined;
}

/**
 * Stamp the calling storefront's coordinates onto a BYOM overlay URL.
 *
 * The shared `render-pdp` action receives requests from Helix without a
 * site-context header (`x-forwarded-host` does not arrive). The action
 * recovers context by reading `org` and `site` query params from the
 * registered overlay URL, which Helix preserves verbatim across overlay
 * dispatch. So each storefront's Configuration Service registration
 * must carry its own coordinates on the URL.
 *
 * Existing query params are preserved; an existing `org` or `site` param
 * is overwritten with the supplied value (idempotent re-stamping on
 * reset).
 *
 * @throws if the URL is malformed, or if `org`/`site` is empty
 */
export function appendOverlayParams(url: string, org: string, site: string): string {
    if (!org) throw new Error('appendOverlayParams: org is required');
    if (!site) throw new Error('appendOverlayParams: site is required');
    const parsed = new URL(url); // throws on malformed input
    parsed.searchParams.set('org', org);
    parsed.searchParams.set('site', site);
    return parsed.toString();
}

/**
 * Compose the fully-stamped BYOM overlay URL for a storefront, or undefined
 * when no overlay should be registered.
 *
 * Two settings gate this:
 * 1. `demoBuilder.byom.enabled` (boolean, default true). When false, returns
 *    undefined immediately — the storefront registers without an overlay.
 * 2. `demoBuilder.byom.overlayUrl` (string). When enabled is true but the URL
 *    resolves to nothing (setting and fromConfig both empty), logs a warning
 *    and returns undefined — the user asked for BYOM but didn't supply a URL.
 */
export function resolveByomOverlayConfig(
    fromConfigUrl: string | undefined,
    org: string,
    site: string,
): string | undefined {
    const enabled = vscode.workspace
        .getConfiguration('demoBuilder.byom')
        .get<boolean>('enabled', true);
    if (!enabled) return undefined;

    const baseUrl = resolveByomOverlayUrl(fromConfigUrl);
    if (!baseUrl) {
        getLogger().warn(
            '[BYOM] demoBuilder.byom.enabled is on but demoBuilder.byom.overlayUrl is empty. Skipping overlay registration.',
        );
        return undefined;
    }
    return appendOverlayParams(baseUrl, org, site);
}

/**
 * User-facing message shown when the BYOM content overlay fails to register
 * with the Configuration Service. Without the overlay, Helix resolves
 * `/products/{urlKey}/{sku}` against the da.live content source (where no such
 * doc exists and which needs auth → 401), so product detail pages never load —
 * even though the smart-404 client code is vendored into the storefront. The
 * remedy is a storefront reset, which re-registers the overlay.
 */
export const BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE =
    "Product detail pages will not load: the storefront's BYOM overlay was not " +
    'registered with the Configuration Service. Reset the storefront to register it.';

/**
 * The 403 variant. "Reset the storefront" is the WRONG remedy for a 403: a reset
 * repeats the same PUT with the same identity and is refused the same way.
 *
 * The Configuration Service admin role is minted for the GitHub user who installs
 * the AEM Code Sync App at org creation, so an org predating that flow refuses even
 * its own owner (2026-08-13, leah-b2b-demo — Code Sync verified installed, DA.live
 * accepting the same token). The remedy is a role grant, and it is self-serve:
 * `tools.aem.live/bot/setup`'s "Site users" step writes
 * `POST config/{org}/sites/{site}/access/admin.json` (verified 2026-08-14). The
 * message names that rather than the GitHub App, because re-installing is the
 * slower path and does not help when the org roster is the gap.
 */
export const BYOM_OVERLAY_NOT_AUTHORIZED_MESSAGE =
    'Product detail pages will not load: the Configuration Service refused the BYOM overlay ' +
    'registration (403 not authorized). Your Adobe identity holds no admin role on this ' +
    "site's configuration — the role is minted when the AEM Code Sync GitHub App is first " +
    'installed, so an older site can refuse even its own owner. Fix: run ' +
    '"Demo Builder: Manage Site Access" — it names who holds the role and opens the AEM setup ' +
    'tool (https://tools.aem.live/bot/setup), where adding your email under "Site users" with ' +
    'the admin role grants it. Then run "Demo Builder: Repair Site Configuration" to retry ' +
    'this write and republish. Resetting the storefront retries with the same identity and ' +
    'will be refused again.';

/**
 * Pick the user-facing message for a failed overlay registration.
 *
 * @param statusCode - the Configuration Service response status, when known
 * @param setupUrl - the site's Code Sync setup deep link
 *   (`configServiceAccess.buildCodeSyncSetupUrl`). Appended for a 403 ONLY: it
 *   is the remedy for an authorization refusal specifically, and attaching it to
 *   every failure teaches users to ignore it.
 * @returns the 403 authorization message, or the generic registration message
 */
export function byomRegistrationFailureMessage(statusCode?: number, setupUrl?: string): string {
    if (statusCode !== 403) return BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE;
    return setupUrl
        ? `${BYOM_OVERLAY_NOT_AUTHORIZED_MESSAGE} Open this site's setup directly: ${setupUrl}`
        : BYOM_OVERLAY_NOT_AUTHORIZED_MESSAGE;
}

/**
 * Why no overlay was registered when none was even attempted.
 *
 * Distinct from {@link BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE}, which says
 * "was not registered" — wrong here, because there was nothing to register. The
 * two causes need different words: one may be deliberate, the other is a
 * misconfiguration the user can fix.
 */
export const BYOM_DISABLED_MESSAGE =
    'Product detail pages will not load: BYOM overlay registration is turned off ' +
    '(demoBuilder.byom.enabled). Turn it on and reset the storefront if this ' +
    'storefront needs product pages.';

export const BYOM_OVERLAY_URL_MISSING_MESSAGE =
    'Product detail pages will not load: no BYOM overlay URL is configured ' +
    '(demoBuilder.byom.overlayUrl), or the configured value was rejected. Set a ' +
    'valid https:// URL and reset the storefront.';

/**
 * Explain why no overlay URL resolved, for the caveat channel.
 *
 * Call only when the resolved overlay URL is absent. Setup previously reported
 * plain success in this case: the "not registered" check was gated on the URL
 * being truthy, so turning BYOM off or supplying an invalid URL skipped the
 * check entirely and the run ended on "Storefront setup completed
 * successfully!" for a storefront that can never serve a PDP.
 *
 * @returns the caveat sentence matching the cause
 */
export function explainAbsentOverlay(): string {
    const enabled = vscode.workspace
        .getConfiguration('demoBuilder.byom')
        .get<boolean>('enabled', true);
    return enabled ? BYOM_OVERLAY_URL_MISSING_MESSAGE : BYOM_DISABLED_MESSAGE;
}

/**
 * Append a PDP caveat, skipping duplicates.
 *
 * Structurally typed rather than taking `RepoInfo`, so this module stays free of
 * the setup types and the phases can call it without an import cycle. Dedupes
 * because phase 3's catch path and its success path can both fire for one run.
 *
 * @param target - the repoInfo (or any caveat carrier) being threaded
 * @param caveat - a user-facing sentence
 */
export function addPdpCaveat(target: { pdpCaveats?: string[] }, caveat: string): void {
    target.pdpCaveats ??= [];
    if (!target.pdpCaveats.includes(caveat)) target.pdpCaveats.push(caveat);
}

/**
 * Explain a skipped smart-404 install.
 *
 * `installSmart404Handler` is non-fatal by design and returns `{installed,
 * reason}`. Both call sites discarded that value, so a storefront could ship
 * without the client-side PDP recovery and still report Complete.
 *
 * @param reason - the publisher's own reason string, when it gave one
 */
export function describeSmart404Skip(reason?: string): string {
    return (
        'Product detail pages may not recover on first visit: the smart-404 handler ' +
        `was not installed${reason ? ` (${reason})` : ''}. Reset the storefront to ` +
        'reinstall it.'
    );
}

/**
 * Surface a failed BYOM overlay registration. Logs at error level always;
 * shows a warning toast only when a `showWarning` callback is wired. Called from
 * storefront create and reset when an overlay URL was configured but the
 * Configuration Service write did not succeed — preventing a storefront from
 * silently shipping with smart-404 client code but no overlay to back it (the
 * state that makes every PDP show "Product not available").
 *
 * Headless safety mirrors `reportUnapplied` in `patchReportHelper`: MCP / AI
 * contexts pass nothing and get logging only; UI-bound callers wire
 * `vscode.window.showWarningMessage`.
 */
export function surfaceOverlayRegistrationFailure(
    logger: Logger,
    showWarning?: (message: string, ...actions: string[]) => Thenable<string | undefined> | void,
    statusCode?: number,
    setupUrl?: string,
): void {
    const message = byomRegistrationFailureMessage(statusCode, setupUrl);
    // The LOG copy is redacted; the toast and the browser get the full URL.
    // The setup link carries the signed-in address as `?user=`, percent-encoded,
    // and `logger.error` is buffered into the debug export users paste into
    // tickets. Encoding is why the generic email masking missed it.
    logger.error(`[BYOM] ${redactUrlUserParam(message)}`);

    // A 403 is the only case with an in-app route: the role has to change hands
    // first, then the refused write has to be retried. Other failures get the
    // plain toast, because offering a repair that will fail the same way is
    // worse than offering nothing.
    const actions = statusCode === 403 ? OVERLAY_403_ACTIONS : [];
    const shown = showWarning?.(message, ...actions);

    // `void` covers the headless callers, which pass a plain logger-ish sink.
    if (!shown || typeof (shown as Thenable<string | undefined>).then !== 'function') return;
    void (shown as Thenable<string | undefined>).then((choice) => {
        if (choice === MANAGE_ACCESS_ACTION) {
            void vscode.commands.executeCommand('demoBuilder.manageSiteAccess');
        } else if (choice === REPAIR_ACTION) {
            void vscode.commands.executeCommand('demoBuilder.repairSiteConfiguration');
        }
    });
}

const MANAGE_ACCESS_ACTION = 'Manage Site Access';
const REPAIR_ACTION = 'Repair Site Configuration';
/** Diagnose first, then retry — the order someone actually has to do them in. */
const OVERLAY_403_ACTIONS = [MANAGE_ACCESS_ACTION, REPAIR_ACTION];

const AUTHORING_EXPERIENCES: ReadonlySet<string> = new Set<AuthoringExperience>([
    'da-live-classic',
    'experience-workspace',
]);

/**
 * Resolve the AEM authoring experience for a project.
 *
 * Precedence (mirrors resolveByomOverlayConfig):
 * 1. Per-project metadata value — if it is a recognized union member, it wins.
 * 2. Global setting demoBuilder.daLive.authoringExperience (default
 *    'da-live-classic').
 * Any unrecognized result coerces to 'da-live-classic' (fail-safe), so a
 * corrupted setting or stray metadata can never break the Author button.
 *
 * @param metadataValue - The per-project `authoringExperience` metadata value
 * @returns The resolved authoring experience
 */
export function resolveAuthoringExperience(metadataValue: string | undefined): AuthoringExperience {
    if (metadataValue && AUTHORING_EXPERIENCES.has(metadataValue)) {
        return metadataValue as AuthoringExperience;
    }

    const globalValue = vscode.workspace
        .getConfiguration('demoBuilder.daLive')
        .get<string>('authoringExperience', 'da-live-classic');

    return AUTHORING_EXPERIENCES.has(globalValue)
        ? (globalValue as AuthoringExperience)
        : 'da-live-classic';
}

/**
 * Resolve the authoring experience for a project by reading its EDS
 * component-instance `authoringExperience` metadata, then applying the
 * resolveAuthoringExperience precedence (per-project → global → UE).
 *
 * @param project - The project (any project; non-EDS yields the global default)
 * @returns The resolved authoring experience
 */
export function resolveProjectAuthoringExperience(
    project: Project | undefined | null,
): AuthoringExperience {
    const edsInstance = project?.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const metadataValue = edsInstance?.metadata?.authoringExperience as string | undefined;
    return resolveAuthoringExperience(metadataValue);
}

/**
 * Read the da-nx branch the Experience Workspace canvas loads from (the `?nx=`
 * override) from the demoBuilder.daLive.ewCanvasBranch setting.
 *
 * Defaults to '' — the param-less production canvas now hosts the live EW alpha,
 * so the URL builder drops the ?nx override entirely (the production form). Set a
 * branch only to pin a specific pre-release da-nx build.
 *
 * Defends against a corrupted (non-string) settings.json value by falling back
 * to the '' default. Returns the value trimmed; a whitespace-only value
 * collapses to ''.
 *
 * @returns The trimmed EW canvas branch (may be empty string)
 */
export function getEwCanvasBranch(): string {
    const raw = vscode.workspace
        .getConfiguration('demoBuilder.daLive')
        .get<string>('ewCanvasBranch', '');
    // VS Code's typed get returns the default on type mismatch, but be defensive
    // about non-string values (corrupted user settings.json).
    if (typeof raw !== 'string') {
        return '';
    }
    return raw.trim();
}

function isAcceptedOverlayUrl(value: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        return false;
    }
    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol === 'http:' && BYOM_LOOPBACK_HOSTS.has(parsed.hostname)) return true;
    return false;
}

/**
 * Describe a rejected URL without echoing it. Avoids leaking secrets that
 * sometimes appear in query strings (e.g., when a user pastes a token-bearing
 * URL by mistake).
 */
function describeRejectedUrl(value: string): string {
    if (value.length > BYOM_MAX_URL_LENGTH) {
        return `length=${value.length} chars, exceeds ${BYOM_MAX_URL_LENGTH}`;
    }
    try {
        const parsed = new URL(value);
        return `scheme="${parsed.protocol.replace(/:$/, '')}", host="${parsed.hostname}"`;
    } catch {
        return `length=${value.length} chars, not URL-shaped`;
    }
}

// ==========================================================
// DA.live Token-First Authentication
// ==========================================================

/**
 * Result of multi-step authentication flow
 */
export interface QuickPickAuthResult {
    success: boolean;
    cancelled?: boolean;
    email?: string;
    error?: string;
}

export interface DaLiveGuardResult {
    /** Whether the user is now authenticated */
    authenticated: boolean;
    /** User dismissed the dialog without signing in */
    cancelled?: boolean;
    /** Error message if auth failed */
    error?: string;
}

/**
 * Ensure DA.live authentication, prompting sign-in if expired.
 *
 * Shared pause-and-prompt guard used by:
 * - EDS project reset (edsResetUI.ts)
 * - Storefront setup pre-flight (storefrontSetupHandlers.ts)
 * - Storefront setup mid-pipeline recovery (storefrontSetupPhases.ts)
 */
export async function ensureDaLiveAuth(
    context: HandlerContext,
    logPrefix = '[Auth]',
): Promise<DaLiveGuardResult> {
    const daLiveAuthService = getDaLiveAuthService(context.context);

    if (await daLiveAuthService.isAuthenticated()) {
        return { authenticated: true };
    }

    context.logger.warn(`${logPrefix} DA.live token expired or missing`);

    const selection = await vscode.window.showWarningMessage(
        'Your DA.live session has expired. Please sign in to continue.',
        'Sign In',
    );

    if (selection !== 'Sign In') {
        return { authenticated: false, cancelled: true };
    }

    const authResult = await showDaLiveAuthQuickPick(context);

    if (!authResult.cancelled && authResult.success) {
        return { authenticated: true };
    }

    return {
        authenticated: false,
        cancelled: authResult.cancelled,
        error: authResult.error || 'DA.live authentication required',
    };
}

/**
 * Show multi-step DA.live authentication flow (token-first)
 *
 * Flow:
 * 1. Info message → token input (password-masked)
 * 2. Org name InputBox
 * 3. Validates token → verifies org access + write permissions → stores
 *
 * Used by both project dashboard and projects list for EDS reset operations.
 *
 * @param context - Handler context with extension context for token storage
 * @returns Promise with auth result (success/cancelled/error)
 */
export async function showDaLiveAuthQuickPick(
    context: HandlerContext,
): Promise<QuickPickAuthResult> {
    context.logger.info('[DA.live Auth] Starting token-first authentication flow');

    // Step 1: Show info message with option to open DA.live
    const openDaLiveChoice = await vscode.window.showInformationMessage(
        'You\'ll need a token from DA.live. Click "Open DA.live" to get one, or continue if you already have it.',
        { modal: false },
        'Open DA.live',
        'I have my token',
    );

    // User dismissed the message (clicked X or pressed Escape)
    if (openDaLiveChoice === undefined) {
        context.logger.info('[DA.live Auth] User cancelled at info message');
        return { success: false, cancelled: true };
    }

    // Open DA.live if requested, then gate on an explicit "I'm back" click before
    // opening the input box. Without this gate, the input box opens immediately at
    // top-of-window — but the user is in the browser doing OAuth, and when they
    // return, the dashboard webview owns the visual center and the input strip is
    // easy to miss. A bottom-right notification with an action button gives the
    // user an attention-grabbing surface to confirm "I have the token" before we
    // open the paste field.
    if (openDaLiveChoice === 'Open DA.live') {
        context.logger.debug('[DA.live Auth] Opening DA.live in browser');
        await vscode.env.openExternal(vscode.Uri.parse('https://da.live'));

        const pasteChoice = await vscode.window.showInformationMessage(
            'When you have your DA.live token (via the bookmarklet), click "Paste Token" to open the paste box.',
            { modal: false },
            'Paste Token',
        );
        if (pasteChoice !== 'Paste Token') {
            context.logger.info('[DA.live Auth] User cancelled at post-browser paste gate');
            return { success: false, cancelled: true };
        }
    }

    // Step 2: Ask for token (password-masked)
    const token = await vscode.window.showInputBox({
        title: 'Sign in to DA.live (Step 1/2)',
        prompt: 'Paste your DA.live token (use the bookmarklet on da.live to copy it)',
        placeHolder: 'Paste token here',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value?.trim()) {
                return 'Token is required';
            }
            if (!value.trim().startsWith('eyJ')) {
                return 'Invalid token format. Token should start with "eyJ"';
            }
            return null;
        },
    });

    // User cancelled
    if (token === undefined) {
        context.logger.info('[DA.live Auth] User cancelled at token step');
        return { success: false, cancelled: true };
    }

    // Step 3: Ask for org name. The wizard uses a Spectrum picker populated
    // from GitHub org memberships (see DaLiveServiceCard); this auth flow is
    // a fallback for command-palette and MCP entry points where the React
    // webview isn't available. Free-text input remains here; converting to a
    // VS Code QuickPick populated from /user/orgs is a separate follow-up.
    const orgName = await vscode.window.showInputBox({
        title: 'Sign in to DA.live (Step 2/2)',
        prompt: 'Enter your DA.live organization name (your GitHub username or a team org you belong to)',
        placeHolder: 'e.g. leahrayard or demo-system-stores',
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value?.trim()) {
                return 'Organization name is required';
            }
            return null;
        },
    });

    // User cancelled
    if (orgName === undefined) {
        context.logger.info('[DA.live Auth] User cancelled at org step');
        return { success: false, cancelled: true };
    }

    // Step 4: Validate token, verify org access + write permissions, store
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Verifying DA.live credentials...',
            cancellable: false,
        },
        async () => {
            try {
                const trimmedToken = token.trim();
                const trimmedOrg = orgName.trim();

                // Validate token format
                const validation = validateDaLiveToken(trimmedToken);
                if (!validation.valid) {
                    context.logger.warn(
                        `[DA.live Auth] Token validation failed: ${validation.error}`,
                    );
                    await vscode.window.showErrorMessage(
                        validation.error ?? 'Token validation failed',
                    );
                    return { success: false, error: validation.error };
                }

                // Pre-auth verification gate removed (namespace-picker plan).
                // It was blocking first-time DA.live users whose AEM Code Sync
                // app hadn't been installed yet; first-time setup is handled by
                // Phase 3 of the create pipeline. Genuine write failures surface
                // at the actual write site with contextual error messaging.

                // Store token with the entered org
                const tokenExpiry = validation.expiresAt || Date.now() + 24 * 60 * 60 * 1000;
                const authService = getDaLiveAuthService(context.context);
                await authService.storeToken(trimmedToken, {
                    expiresAt: tokenExpiry,
                    email: validation.email,
                    orgName: trimmedOrg,
                });

                context.logger.info(
                    `[DA.live Auth] Token stored, namespace pinned to: ${trimmedOrg}`,
                );
                vscode.window.setStatusBarMessage(
                    `✅ Connected to DA.live (${trimmedOrg})`,
                    TIMEOUTS.STATUS_BAR_INFO,
                );

                return {
                    success: true,
                    email: validation.email,
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                context.logger.error(`[DA.live Auth] Authentication error: ${errorMessage}`);
                await vscode.window.showErrorMessage(`Authentication failed: ${errorMessage}`);
                return { success: false, error: errorMessage };
            }
        },
    );
}

// ==========================================================
// Bulk Publish Helpers
// ==========================================================

/**
 * Publish the block library, one page at a time.
 *
 * **The bulk API will not take these paths.** MEASURED against a live site
 * (skukla/team-bodea-demo, 2026-08-18), across two full runs of ~78 paths each:
 *
 *   bulk, relative paths (`.da/library/blocks/text`)   job succeeds, 0 previewed
 *   bulk, ABSOLUTE paths (`/.da/library/blocks/text`)  job succeeds, 0 previewed
 *   single page, `/.da/library/blocks/text`            404 -> 200
 *   single page, `.da/library/blocks/cards`            404 -> 200
 *
 * The bulk endpoint accepts them, creates a job, and polls clean —
 * `assertBulkResourcesSucceeded` finds nothing failed because it finds nothing at
 * all — then publishes none of them. A `.`-prefixed path presumably reads as
 * hidden to the job. Whatever the reason, it is not something the caller can fix
 * by sending better paths: the first fix here WAS better paths, and the spike
 * showed it changed nothing.
 *
 * So this uses the endpoint that works. It costs ~78 sequential calls instead of
 * one job, which is why they go out in batches — and it is the difference between
 * a block library that previews and one that lists blocks nobody can insert.
 *
 * Never throws for a page-level failure: one missing doc page must not cost the
 * other 77 blocks their preview. The count comes back so the caller can report it.
 *
 * @param helixService - Helix admin client
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param paths - Library paths to publish
 * @param logger - Logger instance
 * @returns how many published and how many failed
 */
export async function publishLibraryPaths(
    helixService: HelixService,
    owner: string,
    repo: string,
    paths: string[],
    logger: Logger,
): Promise<{ published: number; failed: number }> {
    if (paths.length === 0) return { published: 0, failed: 0 };

    // Absolute, whatever the caller sent. The single-page endpoint normalises
    // this itself, but the producer's shape should be right regardless of who
    // consumes it.
    const absolute = paths.map((path) => (path.startsWith('/') ? path : `/${path}`));

    logger.debug(`[EDS] Publishing ${absolute.length} library paths`);

    let published = 0;
    const failures: string[] = [];

    for (let i = 0; i < absolute.length; i += LIBRARY_PUBLISH_BATCH) {
        const batch = absolute.slice(i, i + LIBRARY_PUBLISH_BATCH);
        const results = await Promise.allSettled(
            batch.map((path) => helixService.previewAndPublishPage(owner, repo, path)),
        );
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                published++;
            } else {
                failures.push(batch[index]);
            }
        });
    }

    if (failures.length > 0) {
        // Name what was dropped. A count with no paths sends the reader back to
        // the site to work out which blocks are missing.
        const sample = failures.slice(0, 5).join(', ');
        logger.warn(
            `[EDS] ${failures.length} of ${absolute.length} library paths failed to publish` +
                ` (first: ${sample}${failures.length > 5 ? ', ...' : ''})`,
        );
    }

    return { published, failed: failures.length };
}

/**
 * Did the block library actually become previewable?
 *
 * A bulk publish that reports success is not evidence. That is precisely how the
 * broken library shipped: the job accepted paths that matched nothing, reported
 * success, and the only log line said the library was published — while every
 * block in DA.live's Insert-block palette answered "It appears <block> has not
 * been previewed". Nothing between the two ever looked.
 *
 * This asks the same question the palette asks: is the blocks sheet on the
 * PREVIEW host? (`ew-block-library-modal.js` resolves a block through the admin
 * status API and requires `preview.status === 200`.) One HEAD, no credentials —
 * the preview CDN serves this path publicly.
 *
 * Never throws: a creation whose library may be perfectly fine must not fail on a
 * network blip. Unreachable and missing both report `false`, and the difference
 * is in the log.
 *
 * @param owner - GitHub owner (the site's org on the CDN)
 * @param repo - repository / site name
 * @param logger - logger for the warning
 * @returns true when the library sheet is previewed
 */
export async function verifyLibraryPreviewed(
    owner: string,
    repo: string,
    logger: Logger,
    helixService?: HelixService,
): Promise<boolean> {
    const path = '/.da/library/blocks.json';
    const url = `https://main--${repo}--${owner}.aem.page${path}`;
    try {
        const response = await fetch(url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(TIMEOUTS.QUICK),
        });
        if (response.ok) {
            logger.debug(`[EDS] Block library verified previewed: ${url}`);
            return true;
        }
        logger.warn(
            `[EDS] Block library is not previewed (${response.status} for ${url}). ` +
                'Blocks will list in the DA.live Insert-block palette but fail to preview. ' +
                'Run "Demo Builder: Refresh Block Library" to republish it.',
        );
        // The CDN says it is missing; Helix knows WHY. One GET, and the reason
        // lands in the log the user pastes instead of in a session nobody kept.
        await logAdminVerdict(owner, repo, path, logger, helixService);
        return false;
    } catch (error) {
        logger.warn(
            `[EDS] Could not verify the block library preview: ${(error as Error).message}`,
        );
        return false;
    }
}

/**
 * Log what the admin API reports for a path the CDN could not serve.
 *
 * Separate from the check itself so the check stays a boolean: this only ever
 * writes to the log, and a missing `helixService` (headless callers, tests) skips
 * it rather than failing.
 */
async function logAdminVerdict(
    owner: string,
    repo: string,
    path: string,
    logger: Logger,
    helixService?: HelixService,
): Promise<void> {
    if (!helixService) return;
    const status = await helixService.getResourceStatus(owner, repo, path);
    logger.warn(
        `[EDS] Helix status for ${path}: HTTP ${status.httpStatus}` +
            `, preview ${status.previewStatus ?? 'none'}` +
            `, live ${status.liveStatus ?? 'none'}` +
            (status.error ? `, x-error: ${status.error}` : ''),
    );
}

/**
 * Build the site-scoped `editor.path` row value for the active experience.
 *
 * - Experience Workspace: the da.live-native canvas, pinned to the supplied
 *   ewCanvasBranch (the `?nx=` override); the row is always written when the
 *   project is set to EW. An empty branch drops the override.
 * - Universal Editor: punches out to experience.adobe.com and embeds the IMS org
 *   id, so it is only written when `demoBuilder.daLive.IMSOrgId` is configured.
 *
 * Returns undefined when there is no row to write (UE with no IMS org id).
 */
function buildEditorPathValue(
    experience: AuthoringExperience,
    imsOrgId: string | undefined,
    daLiveOrg: string,
    daLiveSite: string,
    ewCanvasBranch: string,
): string | undefined {
    if (experience === 'experience-workspace') {
        // `?nx=<branch>` pins the canvas to a pre-release da-nx branch while EW is
        // in early access; an empty branch drops to `https://da.live/canvas#`
        // (the documented production form). Mirrors getEdsDaLiveUrl's EW form.
        const nxParam = ewCanvasBranch ? `?nx=${ewCanvasBranch}` : '';
        return `https://da.live/canvas${nxParam}#`;
    }
    if (imsOrgId) {
        return (
            `https://experience.adobe.com/#/@${imsOrgId}` +
            `/aem/editor/canvas/main--${daLiveSite}--${daLiveOrg}.ue.da.live`
        );
    }
    return undefined;
}

/**
 * Apply DA.live org config settings from extension settings.
 *
 * Reads the AEM Author URL and IMS Org ID from VS Code settings
 * (demoBuilder.daLive.aemAuthorUrl and demoBuilder.daLive.IMSOrgId)
 * and applies them to the DA.live site config sheet.
 *
 * Also clears a stale `editor.path` row symmetrically: flipping to Universal
 * Editor with no IMS org id has no row to write, so the prior Experience
 * Workspace canvas value is removed (via applySiteConfig's `removeKeys`) rather
 * than left behind.
 *
 * This should be called from all EDS flows: creation, reset, edit, import, copy.
 * Non-fatal: logs warnings on failure but does not throw.
 */
export async function applyDaLiveOrgConfigSettings(
    daLiveContentOps: DaLiveContentOperations,
    daLiveOrg: string,
    daLiveSite: string,
    logger: Logger,
    experience: AuthoringExperience = 'da-live-classic',
): Promise<void> {
    try {
        const edsSettings = vscode.workspace.getConfiguration('demoBuilder.daLive');
        const aemAuthorUrl = edsSettings.get<string>('aemAuthorUrl');
        const imsOrgId = edsSettings.get<string>('IMSOrgId');

        // Both keys land in the SAME per-site config (/config/<org>/<site>), so
        // collect them and write once — one GET-merge-POST round-trip, no window
        // for a concurrent writer to slip between two separate writes.
        //   - aem.repositoryId: da.live's Library reads the AEM Assets binding
        //     from the per-site config.
        //   - editor.path: site-scoped, keyed on /<org>/<site>, so flipping one
        //     project's authoring experience never clobbers a sibling site's row.
        const updates: Record<string, string> = {};
        const removeKeys: string[] = [];
        if (aemAuthorUrl) {
            updates['aem.repositoryId'] = aemAuthorUrl;
        } else {
            // Symmetric with editor.path below. Without this, clearing
            // `aemAuthorUrl` left the previous binding on the site for good —
            // a state the extension could create and then never undo.
            removeKeys.push('aem.repositoryId');
        }
        const ewCanvasBranch = getEwCanvasBranch();
        const editorValue = buildEditorPathValue(
            experience,
            imsOrgId,
            daLiveOrg,
            daLiveSite,
            ewCanvasBranch,
        );
        if (editorValue) {
            updates['editor.path'] = `/${daLiveOrg}/${daLiveSite}=${editorValue}`;
        } else {
            // UE with no IMS org id → there is no row to write, but da.live may
            // hold a stale Experience Workspace canvas row from a prior flip. The
            // correct state is NO editor.path row, so clear it. (applySiteConfig's
            // no-op optimization absorbs the case where no stale row exists.)
            removeKeys.push('editor.path');
        }

        const appliedKeys = Object.keys(updates);
        if (appliedKeys.length === 0 && removeKeys.length === 0) {
            // Truly nothing to do. Logged (not silent) so a no-op flip is diagnosable.
            logger.debug('[EDS Config] No DA.live config to apply or clear; skipping.');
            return;
        }

        const result = await daLiveContentOps.applySiteConfig(
            daLiveOrg,
            daLiveSite,
            updates,
            removeKeys,
        );
        // Name the AEM host, not just the key. `aemAuthorUrl` ships with a
        // DEFAULT, so "aem.repositoryId was applied" is true for every user and
        // tells nobody which repository they were bound to — a colleague's
        // missing Assets panel could not be told apart from a wrong host without
        // asking her to read her own settings. The value is a hostname already
        // published in package.json, so logging it discloses nothing new.
        const boundHost = updates['aem.repositoryId'];
        const summary = [
            appliedKeys.length ? `Applied: ${appliedKeys.join(', ')}` : '',
            boundHost ? `AEM Assets bound to ${boundHost}` : '',
            removeKeys.length ? `Cleared: ${removeKeys.join(', ')}` : '',
        ]
            .filter(Boolean)
            .join('; ');
        if (result.success) {
            logger.info(`[EDS Config] ${summary}`);
        } else {
            logger.warn(`[EDS Config] Failed to apply settings (${summary}): ${result.error}`);
        }
    } catch (error) {
        logger.warn(`[EDS Config] Error: ${(error as Error).message}`);
    }
}

/**
 * Configure DA.live site permissions for the user.
 *
 * Grants the user CONFIG and content write permissions via DA.live Config API.
 * This enables Universal Editor access and site management capabilities.
 *
 * This should be called from all EDS flows: creation, reset, republish.
 * Non-fatal: logs warnings on failure but does not throw.
 *
 * @param tokenProvider - Token provider for DA.live API authentication
 * @param daLiveOrg - DA.live organization name
 * @param daLiveSite - DA.live site name
 * @param userEmail - User email to grant permissions to
 * @param logger - Logger instance
 * @returns Result with success status and optional error message
 */
export async function configureDaLivePermissions(
    tokenProvider: TokenProvider,
    daLiveOrg: string,
    daLiveSite: string,
    userEmail: string,
    logger: Logger,
): Promise<{ success: boolean; error?: string }> {
    try {
        const daLiveConfigService = new DaLiveConfigService(tokenProvider, logger);
        const result = await daLiveConfigService.grantUserAccess(daLiveOrg, daLiveSite, userEmail);
        if (result.success) {
            // `info` IS buffered into the debug export; mask like the rest of the batch.
        logger.info(`[DaLivePermissions] Configured for ${maskEmail(userEmail)}`);
        } else {
            logger.warn(`[DaLivePermissions] Warning: ${result.error}`);
        }
        return result;
    } catch (error) {
        const errorMessage = (error as Error).message;
        logger.warn(`[DaLivePermissions] Error: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}
