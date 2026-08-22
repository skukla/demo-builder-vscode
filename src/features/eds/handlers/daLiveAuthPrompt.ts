/**
 * DA.live token validation and the interactive sign-in flow.
 *
 * Validation and the prompt live together because the prompt validates in two
 * places — once on the clipboard, once on what was stored — and separating
 * them invites a second, drifting copy of "is this token any good".
 *
 * @module features/eds/handlers/daLiveAuthPrompt
 */

import * as vscode from 'vscode';
import { parseJwtPayload } from '../services/daLiveAuthService';
import { getDaLiveAuthService } from './edsServiceCache';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

/**
 * The two HandlerContext fields this module's whole flow reads. Narrowed so
 * headless/command callers (e.g. refreshBlockLibraryHeadless) can pass
 * `{ context, logger }` without a widening cast; full-HandlerContext callers
 * satisfy it structurally.
 */
type DaLiveAuthContext = Pick<HandlerContext, 'context' | 'logger'>;

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
    context: DaLiveAuthContext,
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
 * Read a DA.live token off the clipboard.
 *
 * The bookmarklet's whole job is to put the token there, so by the time the
 * user says they have copied it we can usually just take it — a paste box asks for
 * a keystroke to hand us something we can already read.
 *
 * Validated, never trusted: re-copying the token that just expired is the
 * likeliest thing to find here, and it must fall through to the input box
 * rather than be stored as if it were fresh.
 *
 * @param logger - Logger for the (debug-level) reason a clipboard read was unusable
 * @returns The token, or undefined when the clipboard holds anything else
 */
async function readTokenFromClipboard(logger: Logger): Promise<string | undefined> {
    try {
        const clipped = (await vscode.env.clipboard.readText())?.trim();
        if (!clipped) {
            return undefined;
        }
        const validation = validateDaLiveTokenStrict(clipped);
        if (!validation.valid) {
            logger.debug(`[DA.live Auth] Clipboard holds no DA.live token: ${validation.error}`);
            return undefined;
        }
        logger.info('[DA.live Auth] Token taken from clipboard');
        return clipped;
    } catch (error) {
        // A denied or unavailable clipboard is not an auth failure — the input
        // box still works.
        logger.debug(`[DA.live Auth] Clipboard read failed: ${(error as Error).message}`);
        return undefined;
    }
}

/**
 * Validate a token, demanding proof it IS a DA.live credential rather than
 * merely absence of proof that it is not.
 *
 * {@link validateDaLiveToken} answers a weaker question, and deliberately so:
 * it passes anything starting with `eyJ` whose payload it cannot read. But
 * base64 of any JSON begins `eyJ` and carries no `.`, so `parseJwtPayload`
 * returns null for an encoded .env, a k8s secret or a config blob — and every
 * one of those was stored and sent as `Authorization: Bearer`.
 *
 * Three additional demands, each closing a measured hole:
 *
 *   - the payload must PARSE, not merely be unreadable;
 *   - it must NAME darkalley rather than fail to contradict it — a foreign JWT
 *     carrying no `client_id` passes the weak check;
 *   - it must carry a readable lifetime. Without one the callers invent
 *     `now + 24h`, and that fabricated expiry outranks a real one in the
 *     da-auth-helper cache (`writeDaAuthHelperToken` keeps the later expiry),
 *     so it evicts a working agent credential and 401s every later call.
 *
 * Used by every path that turns an untrusted string into a stored credential:
 * the clipboard read here, and both webview store-token handlers. The lenient
 * check remains for callers that only need to know whether a token is
 * plausible.
 *
 * @param token - The candidate token, already trimmed
 * @returns The lenient result when it passes, or a reason the user can act on
 */
export function validateDaLiveTokenStrict(token: string): DaLiveTokenValidationResult {
    const validation = validateDaLiveToken(token);
    if (!validation.valid) {
        return validation;
    }
    if (parseJwtPayload(token)?.client_id !== 'darkalley') {
        return {
            valid: false,
            error: 'This does not look like a DA.live token. Use the bookmarklet on da.live to copy a fresh one.',
        };
    }
    if (validation.expiresAt === undefined) {
        return {
            valid: false,
            error: 'This DA.live token carries no expiry, so it cannot be stored safely. Use the bookmarklet on da.live to copy a fresh one.',
        };
    }
    return validation;
}

/**
 * Ask which DA.live namespace to sign into.
 *
 * The wizard uses a Spectrum picker populated from GitHub org memberships (see
 * DaLiveServiceCard); this is the fallback for command-palette and MCP entry
 * points where the React webview isn't available. Converting it to a QuickPick
 * over /user/orgs is a separate follow-up.
 *
 * Titled by what it asks for rather than "Step 1 of 2": the clipboard may
 * supply the token, in which case no second box ever opens, and this function
 * cannot know that yet.
 *
 * @returns The namespace, or undefined when the user cancelled
 */
function promptForOrgName(): Thenable<string | undefined> {
    return vscode.window.showInputBox({
        title: 'Sign in to DA.live — namespace',
        prompt: 'Enter your DA.live organization name (your GitHub username or a team org you belong to)',
        placeHolder: 'e.g. your-github-username or demo-system-stores',
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value?.trim()) {
                return 'Organization name is required';
            }
            return null;
        },
    });
}

/**
 * Ask for the token, for when the clipboard did not hold a usable one.
 *
 * The `eyJ` check here is a fast-fail for the typist, not a security control —
 * `validateDaLiveToken` re-checks everything before the token is stored.
 *
 * @returns The pasted token, or undefined when the user cancelled
 */
function promptForToken(): Thenable<string | undefined> {
    return vscode.window.showInputBox({
        title: 'Sign in to DA.live — token',
        prompt: 'No DA.live token found on your clipboard. Run the bookmarklet on da.live to copy one, then paste it here.',
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
}

/**
 * Offer the trip to da.live, and wait until the user says they hold a token.
 *
 * The second notification is load-bearing, not a courtesy. Without it the
 * input box opens the moment the browser does — but the user is away doing
 * OAuth, and when they return the dashboard webview owns the visual centre and
 * the input strip at top-of-window is easy to miss. A bottom-right notification
 * with a button is something they can actually find.
 *
 * It now gates more than an input box: `readTokenFromClipboard` runs after this
 * returns, so this click is also the user's consent to read the clipboard.
 * Nothing here or before it touches the clipboard.
 *
 * @param context - Handler context, for logging
 * @returns True to proceed to the token step; false when the user backed out
 */
async function confirmTokenReady(context: DaLiveAuthContext): Promise<boolean> {
    const openDaLiveChoice = await vscode.window.showInformationMessage(
        'You\'ll need a token from DA.live. Click "Open DA.live" to get one, or continue if you already have it.',
        { modal: false },
        'Open DA.live',
        'I have my token',
    );

    // User dismissed the message (clicked X or pressed Escape)
    if (openDaLiveChoice === undefined) {
        context.logger.info('[DA.live Auth] User cancelled at info message');
        return false;
    }

    if (openDaLiveChoice !== 'Open DA.live') {
        return true;
    }

    context.logger.debug('[DA.live Auth] Opening DA.live in browser');
    await vscode.env.openExternal(vscode.Uri.parse('https://da.live'));

    const pasteChoice = await vscode.window.showInformationMessage(
        'Run the DA.live bookmarklet to copy your token, then click Continue.',
        { modal: false },
        'Continue',
    );
    if (pasteChoice !== 'Continue') {
        context.logger.info('[DA.live Auth] User cancelled at post-browser paste gate');
        return false;
    }
    return true;
}

/**
 * Show the DA.live authentication flow.
 *
 * Flow:
 * 1. Org name InputBox — SKIPPED when a namespace is already pinned
 * 2. Info message → optional browser trip → "Continue" gate
 * 3. Token from the clipboard, or an input box when the clipboard has none
 * 4. Validates token → stores it against the org
 *
 * **The org step is the one that used to bite.** A token expiring does not
 * clear the pinned namespace — only an explicit `logout()` does — so on every
 * expiry this flow was asking the user to re-type a value it had already
 * stored (`daLiveAuthService.getOrgName`). It now asks only when nothing is
 * pinned, and asks FIRST when it does: the org identifies the user, and
 * identifying yourself after handing over a credential reads backwards.
 *
 * Used by both project dashboard and projects list for EDS reset operations.
 *
 * @param context - Handler context with extension context for token storage
 * @returns Promise with auth result (success/cancelled/error)
 */
export async function showDaLiveAuthQuickPick(
    context: DaLiveAuthContext,
): Promise<QuickPickAuthResult> {
    context.logger.info('[DA.live Auth] Starting authentication flow');

    // Step 1: Org name — only when we do not already have one. The DA.live org
    // is the GitHub namespace (a personal login or a GitHub org the user
    // belongs to), so it CAN change between sign-ins; what it cannot do is
    // change without the user going somewhere to change it, which makes the
    // pinned value right until then.
    const pinnedOrg = getDaLiveAuthService(context.context).getOrgName();
    let orgName = pinnedOrg;
    if (!orgName) {
        orgName = await promptForOrgName();

        // User cancelled
        if (orgName === undefined) {
            context.logger.info('[DA.live Auth] User cancelled at org step');
            return { success: false, cancelled: true };
        }
    } else {
        context.logger.debug(`[DA.live Auth] Reusing pinned namespace: ${pinnedOrg}`);
    }

    // Step 2: Offer the browser trip, and wait for the user to say they have
    // a token before anything reaches for one.
    if (!(await confirmTokenReady(context))) {
        return { success: false, cancelled: true };
    }

    // Step 3: Token — from the clipboard when the bookmarklet has just put one
    // there, otherwise from a paste box.
    let token = await readTokenFromClipboard(context.logger);
    if (token === undefined) {
        token = await promptForToken();

        // User cancelled
        if (token === undefined) {
            context.logger.info('[DA.live Auth] User cancelled at token step');
            return { success: false, cancelled: true };
        }
    }

    // Step 4: Validate token, store it against the org
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Verifying DA.live credentials...',
            cancellable: false,
        },
        () => validateAndStoreToken(context, token, orgName),
    );
}

/**
 * Validate the collected token and pin it to the namespace.
 *
 * Runs for BOTH token sources. The clipboard path already passed
 * `validateDaLiveTokenStrict` inside `readTokenFromClipboard`, but the typed
 * path has proved nothing yet, so validation happens here regardless — the
 * clipboard is simply checked twice, which is cheap and keeps this the single
 * place a token becomes real.
 *
 * Never throws: every failure returns a result the caller reports.
 *
 * @param context - Handler context, for the extension context and logger
 * @param token - The collected token, untrimmed
 * @param orgName - The namespace to pin it to, untrimmed
 * @returns The auth result
 */
async function validateAndStoreToken(
    context: DaLiveAuthContext,
    token: string,
    orgName: string,
): Promise<QuickPickAuthResult> {
    try {
        const trimmedToken = token.trim();
        const trimmedOrg = orgName.trim();

        const validation = validateDaLiveToken(trimmedToken);
        if (!validation.valid) {
            context.logger.warn(`[DA.live Auth] Token validation failed: ${validation.error}`);
            await vscode.window.showErrorMessage(validation.error ?? 'Token validation failed');
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

        context.logger.info(`[DA.live Auth] Token stored, namespace pinned to: ${trimmedOrg}`);
        // Name WHO signed in, not just where. On the clipboard path the user
        // never looked at the token, so this is the only place a wrong identity
        // can show itself — a colleague's still-valid token would otherwise
        // bind silently and 403 every later write.
        vscode.window.setStatusBarMessage(
            `✅ Connected to DA.live (${trimmedOrg})` +
                (validation.email ? ` as ${validation.email}` : ''),
            TIMEOUTS.STATUS_BAR_INFO,
        );

        return { success: true, email: validation.email };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        context.logger.error(`[DA.live Auth] Authentication error: ${errorMessage}`);
        await vscode.window.showErrorMessage(`Authentication failed: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}
