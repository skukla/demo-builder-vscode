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
import { DaLiveContentOperations } from '../services/daLiveContentOperations';
import { hasWriteAccess, type TokenProvider } from '../services/daLiveOrgOperations';
import { GitHubFileOperations } from '../services/githubFileOperations';
import { GitHubOAuthService } from '../services/githubOAuthService';
import { GitHubRepoOperations } from '../services/githubRepoOperations';
import { GitHubTokenService } from '../services/githubTokenService';
import { HelixService } from '../services/helixService';
import { getLogger } from '@/core/logging';
import { COMPONENT_IDS } from '@/core/constants';
import { showOneTimeTip } from '@/core/utils/oneTimeTip';
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
// DA.live Default Org Tip
// ==========================================================

/**
 * Show a one-time tip offering to save the org name as a default setting.
 *
 * Only shown when:
 * - The config setting is not already set
 * - The tip has not been shown before (tracked via globalState)
 *
 * Non-blocking: uses fire-and-forget `.then()` so it never delays the caller.
 *
 * @param context - Handler context for globalState access
 * @param orgName - The verified org name to offer saving
 */
export function offerSaveDefaultOrg(
    context: HandlerContext,
    orgName: string,
): void {
    const config = vscode.workspace.getConfiguration('demoBuilder');

    // Already configured — nothing to do
    if (config.get<string>('daLive.defaultOrg', '')) {
        return;
    }

    showOneTimeTip(context.context.globalState, {
        stateKey: 'daLive.defaultOrgTipShown',
        message: `Tip: Save "${orgName}" as your default DA.live org so it auto-fills next time.`,
        actions: [`Save "${orgName}"`, 'Open Settings'],
        onAction: (selection) => {
            if (selection === `Save "${orgName}"`) {
                config.update('daLive.defaultOrg', orgName, vscode.ConfigurationTarget.Global);
            } else if (selection === 'Open Settings') {
                vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    'demoBuilder.daLive.defaultOrg',
                );
            }
        },
    });
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
    const raw = vscode.workspace
        .getConfiguration('demoBuilder.byom')
        .get<string>('overlayUrl', '');
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
    const parsed = new URL(url);  // throws on malformed input
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

const AUTHORING_EXPERIENCES: ReadonlySet<string> = new Set<AuthoringExperience>([
    'universal-editor',
    'experience-workspace',
]);

/**
 * Resolve the AEM authoring experience for a project.
 *
 * Precedence (mirrors resolveByomOverlayConfig):
 * 1. Per-project metadata value — if it is a recognized union member, it wins.
 * 2. Global setting demoBuilder.daLive.authoringExperience (default
 *    'universal-editor').
 * Any unrecognized result coerces to 'universal-editor' (fail-safe), so a
 * corrupted setting or stray metadata can never break the Author button.
 *
 * @param metadataValue - The per-project `authoringExperience` metadata value
 * @returns The resolved authoring experience
 */
export function resolveAuthoringExperience(
    metadataValue: string | undefined,
): AuthoringExperience {
    if (metadataValue && AUTHORING_EXPERIENCES.has(metadataValue)) {
        return metadataValue as AuthoringExperience;
    }

    const globalValue = vscode.workspace
        .getConfiguration('demoBuilder.daLive')
        .get<string>('authoringExperience', 'universal-editor');

    return AUTHORING_EXPERIENCES.has(globalValue)
        ? (globalValue as AuthoringExperience)
        : 'universal-editor';
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
 * Required while EW is in early access (the production da.live/canvas doesn't
 * render the Layout view yet); clearing the setting yields '' so the URL builder
 * drops the ?nx override entirely (the documented production form).
 *
 * Defends against a corrupted (non-string) settings.json value by falling back
 * to the 'exp-workspace' default. Returns the value trimmed; a whitespace-only
 * value collapses to ''.
 *
 * @returns The trimmed EW canvas branch (may be empty string)
 */
export function getEwCanvasBranch(): string {
    const raw = vscode.workspace
        .getConfiguration('demoBuilder.daLive')
        .get<string>('ewCanvasBranch', 'exp-workspace');
    // VS Code's typed get returns the default on type mismatch, but be defensive
    // about non-string values (corrupted user settings.json).
    if (typeof raw !== 'string') {
        return 'exp-workspace';
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

    // Step 3: Ask for org name
    const defaultOrg = vscode.workspace.getConfiguration('demoBuilder').get<string>('daLive.defaultOrg', '');
    const orgName = await vscode.window.showInputBox({
        title: 'Sign in to DA.live (Step 2/2)',
        prompt: 'Enter your DA.live organization name',
        placeHolder: 'e.g. my-org',
        value: defaultOrg,
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
                    context.logger.warn(`[DA.live Auth] Token validation failed: ${validation.error}`);
                    await vscode.window.showErrorMessage(validation.error ?? 'Token validation failed');
                    return { success: false, error: validation.error };
                }

                // Verify org access
                context.logger.debug(`[DA.live Auth] Verifying org access: ${trimmedOrg}`);
                const orgResponse = await fetch(`https://admin.da.live/list/${trimmedOrg}/`, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${trimmedToken}` },
                });

                if (orgResponse.status === 403) {
                    const error = `Access denied to organization "${trimmedOrg}". Please check the name or your permissions.`;
                    await vscode.window.showErrorMessage(error);
                    return { success: false, error };
                }

                if (orgResponse.status === 404) {
                    const error = `Organization "${trimmedOrg}" not found. Please check the name.`;
                    await vscode.window.showErrorMessage(error);
                    return { success: false, error };
                }

                if (!orgResponse.ok) {
                    const error = `Failed to verify organization: ${orgResponse.status}`;
                    await vscode.window.showErrorMessage(error);
                    return { success: false, error };
                }

                // Verify write access
                const writable = await hasWriteAccess(trimmedOrg, trimmedToken);
                if (!writable) {
                    const error = `You have read-only access to "${trimmedOrg}". Please enter an organization you own.`;
                    await vscode.window.showErrorMessage(error);
                    return { success: false, error };
                }

                // Store token with verified org
                const tokenExpiry = validation.expiresAt || (Date.now() + 24 * 60 * 60 * 1000);
                const authService = getDaLiveAuthService(context.context);
                await authService.storeToken(trimmedToken, {
                    expiresAt: tokenExpiry,
                    email: validation.email,
                    orgName: trimmedOrg,
                });

                context.logger.info(`[DA.live Auth] Successfully authenticated to org: ${trimmedOrg}`);
                vscode.window.setStatusBarMessage(`✅ Connected to DA.live (${trimmedOrg})`, TIMEOUTS.STATUS_BAR_INFO);

                // Offer to save org as default (one-time, non-blocking)
                offerSaveDefaultOrg(context, trimmedOrg);

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
 * Bulk preview and publish paths via Helix Admin API
 *
 * Use this for publishing multiple paths efficiently instead of looping
 * through individual previewAndPublishPage calls.
 *
 * Note: Cache purging should be done BEFORE calling this function via
 * helixService.purgeCacheAll() for reset/republish scenarios.
 *
 * @param helixService - HelixService instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param paths - Array of paths to preview and publish
 * @param logger - Logger instance
 */
export async function bulkPreviewAndPublish(
    helixService: HelixService,
    owner: string,
    repo: string,
    paths: string[],
    logger: Logger,
): Promise<void> {
    if (paths.length === 0) return;

    logger.debug(`[EDS] Bulk publishing ${paths.length} paths`);
    try {
        await helixService.previewAllContent(owner, repo, 'main', undefined, paths);
        await helixService.publishAllContent(owner, repo, 'main', undefined, paths);
    } catch (error) {
        logger.debug(`[EDS] Bulk publish failed: ${(error as Error).message}`);
        throw error;
    }
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
        return `https://experience.adobe.com/#/@${imsOrgId}`
            + `/aem/editor/canvas/main--${daLiveSite}--${daLiveOrg}.ue.da.live`;
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
    experience: AuthoringExperience = 'universal-editor',
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
        }
        const ewCanvasBranch = getEwCanvasBranch();
        const editorValue = buildEditorPathValue(experience, imsOrgId, daLiveOrg, daLiveSite, ewCanvasBranch);
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
            logger.debug(
                '[EDS Config] No DA.live config to apply or clear; skipping.',
            );
            return;
        }

        const result = await daLiveContentOps.applySiteConfig(daLiveOrg, daLiveSite, updates, removeKeys);
        const summary = [
            appliedKeys.length ? `Applied: ${appliedKeys.join(', ')}` : '',
            removeKeys.length ? `Cleared: ${removeKeys.join(', ')}` : '',
        ].filter(Boolean).join('; ');
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
        const result = await daLiveConfigService.grantUserAccess(
            daLiveOrg,
            daLiveSite,
            userEmail,
        );
        if (result.success) {
            logger.info(`[DaLivePermissions] Configured for ${userEmail}`);
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
