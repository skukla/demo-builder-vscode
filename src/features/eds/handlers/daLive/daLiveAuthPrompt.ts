/**
 * The interactive DA.live sign-in: DA.live has no headless token grant, so this
 * runs native VS Code prompts (namespace, a trip to da.live, the token from the
 * clipboard or an input box), or one form when a progress modal is already up,
 * and stores the token against the namespace.
 *
 * Whether a token is any good is `daLiveTokenValidation`'s question, asked here
 * twice (on the clipboard, and on what is about to be stored). Whether to sign
 * in at all before an operation is `daLiveAuthGuard`'s.
 *
 * @module features/eds/handlers/daLive/daLiveAuthPrompt
 */

import * as vscode from 'vscode';
import { validateDaLiveTokenStrict } from '../../services/daLive/daLiveTokenValidation';
import { getDaLiveAuthService } from '../edsServiceCache';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { askForDetailsDuringOperation, modalIsAsking } from '@/core/vscode/operationPrompt';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

/**
 * The two HandlerContext fields this module's whole flow (and the guard in front
 * of it) reads. Narrowed so
 * headless/command callers (e.g. refreshBlockLibraryHeadless) can pass
 * `{ context, logger }` without a widening cast; full-HandlerContext callers
 * satisfy it structurally.
 */
export type DaLiveAuthContext = Pick<HandlerContext, 'context' | 'logger'>;

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
 * `validateDaLiveTokenStrict` re-checks everything before the token is stored.
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
 * @param reason - why it is asking, shown at the head of the modal's form
 * @returns Promise with auth result (success/cancelled/error)
 */
export async function showDaLiveAuthQuickPick(
    context: DaLiveAuthContext,
    reason?: string,
): Promise<QuickPickAuthResult> {
    context.logger.info('[DA.live Auth] Starting authentication flow');

    // A progress modal is already on screen for this operation, so it asks: one
    // question, one surface, fields and all (owner, 2026-09-20).
    if (modalIsAsking()) {
        return signInThroughModal(context, reason);
    }

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
            title: 'Verifying DA.live credentials',
            cancellable: false,
        },
        () => validateAndStoreToken(context, token, orgName),
    );
}

/**
 * Sign in inside the progress modal: one form, however many tries it takes.
 *
 * The input-box flow below asks four things in sequence — namespace, a trip to
 * da.live, a Continue gate, then the token — because a VS Code input box can only
 * ask one thing at a time. A form has no such limit, so this asks for everything at
 * once and re-asks with what was typed when something is wrong.
 *
 * "Open DA.live" is an answer rather than a link: it opens the browser and asks
 * again, carrying the values forward, so the SC comes back to the form they left.
 *
 * The clipboard is read only after the SC has asked for the browser trip — the same
 * consent point the notification flow uses. Nothing before that touches it.
 *
 * @param context - Handler context, for token storage and logging
 * @param reason - why it is asking, when something expired
 * @returns The auth result
 */
async function signInThroughModal(
    context: DaLiveAuthContext,
    reason?: string,
): Promise<QuickPickAuthResult> {
    const service = getDaLiveAuthService(context.context);
    let orgName = service.getOrgName() ?? '';
    let token = '';
    // What is wrong with each field, shown under it on the next ask.
    let orgProblem: string | undefined;
    let tokenProblem: string | undefined;

    for (;;) {
        const asked = await askForDetailsDuringOperation({
            message: [
                reason,
                'Sign in to DA.live: run the bookmarklet on da.live to copy a token, then paste it here.',
            ]
                .filter(Boolean)
                .join(' '),
            fields: [
                {
                    id: 'orgName',
                    label: 'DA.live namespace',
                    value: orgName,
                    placeholder: 'your GitHub username, or an org you belong to',
                    description: orgProblem,
                },
                {
                    id: 'token',
                    label: 'Token',
                    value: token,
                    placeholder: 'Paste the token from the bookmarklet',
                    secret: true,
                    description: tokenProblem,
                },
            ],
            actions: ['Sign In', 'Open DA.live'],
        });

        orgName = asked.values.orgName ?? orgName;
        token = asked.values.token ?? token;

        if (!asked.action) {
            context.logger.info('[DA.live Auth] Cancelled in the progress modal');
            return { success: false, cancelled: true };
        }

        if (asked.action === 'Open DA.live') {
            context.logger.debug('[DA.live Auth] Opening DA.live in browser');
            await vscode.env.openExternal(vscode.Uri.parse('https://da.live'));
            // The trip is the consent to read the clipboard, exactly as in the
            // notification flow — and coming back to a filled field is the point.
            token = (await readTokenFromClipboard(context.logger)) ?? token;
            orgProblem = undefined;
            tokenProblem = undefined;
            continue;
        }

        orgProblem = orgName.trim() ? undefined : 'Enter your DA.live namespace.';
        tokenProblem = token.trim() ? undefined : 'Paste the token the bookmarklet copied.';
        if (orgProblem || tokenProblem) {
            continue;
        }

        const stored = await validateAndStoreToken(context, token, orgName);
        if (stored.success) {
            return stored;
        }
        // Wrong or expired: say so under the field and let them paste another.
        tokenProblem = stored.error ?? 'That token was not accepted.';
    }
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

        // The SAME check the clipboard path uses. A token that states no expiry was
        // previously accepted here and stored with an invented 24-hour lifetime — so the
        // identical token was refused as unsafe when pasted and accepted when typed. The
        // invented expiry was also load-bearing in the wrong direction: everything
        // downstream reads it to decide when to re-authenticate, so a token that really
        // had minutes left was treated as good for a day, and operations failed mid-flight
        // instead of prompting a clean sign-in. (Owner, 2026-09-02.)
        const validation = validateDaLiveTokenStrict(trimmedToken);
        if (!validation.valid) {
            context.logger.warn(`[DA.live Auth] Token validation failed: ${validation.error}`);
            // Only when nothing else is telling them: the modal shows the reason
            // under the field it belongs to.
            if (!modalIsAsking()) {
                await vscode.window.showErrorMessage(validation.error ?? 'Token validation failed');
            }
            return { success: false, error: validation.error };
        }

        // Pre-auth verification gate removed (namespace-picker plan).
        // It was blocking first-time DA.live users whose AEM Code Sync
        // app hadn't been installed yet; first-time setup is handled by
        // Phase 3 of the create pipeline. Genuine write failures surface
        // at the actual write site with contextual error messaging.

        // Store token with the entered org. No expiry fallback: the strict check above
        // refuses a token that does not state one.
        const authService = getDaLiveAuthService(context.context);
        await authService.storeToken(trimmedToken, {
            expiresAt: validation.expiresAt,
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
        if (!modalIsAsking()) {
            await vscode.window.showErrorMessage(`Authentication failed: ${errorMessage}`);
        }
        return { success: false, error: errorMessage };
    }
}
