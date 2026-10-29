/**
 * One Adobe sign-in: open the browser with `aio auth login`, wait for it, and drop
 * what the previous sign-in left cached so the new token is read afresh.
 *
 * Split from `authenticationService.ts` (decompose-god-file, 2026-10-08). That file
 * keeps `login`, which sends every sign-in through the gate (`signInGate.ts`); the
 * gate is what calls `runAdobeLogin`, so nothing else should.
 *
 * @module features/authentication/services/adobeSignIn
 */

import type { AdobeSDKClient } from './adobeSDKClient';
import type { AuthCacheManager } from './authCacheManager';
import { AuthenticationErrorFormatter } from './authenticationErrorFormatter';
import { isValidTokenResponse } from './authPredicates';
import { withTiming } from './performanceTracker';
import { beginSignIn, signInLinkIn } from '@/core/auth/signInSession';
import type { DebugLogger } from '@/core/logging/debugLogger';
import type { StepLogger } from '@/core/logging/stepLogger';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { CommandResult } from '@/core/shell/types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** What a sign-in reads and clears. Built once by `AuthenticationService`. */
export interface AdobeSignInDeps {
    commandManager: CommandExecutor;
    cacheManager: AuthCacheManager;
    sdkClient: AdobeSDKClient;
    logger: Logger;
    debugLogger: DebugLogger;
    /** The service's lazily created StepLogger. */
    stepLogger: () => Promise<StepLogger>;
    /**
     * What a FORCED sign-in can end elsewhere (`ForcedSignInWatch`). Read just before
     * `aio auth login -f`, every time it runs, including the retry a normal sign-in falls
     * back to. Optional: nothing is watched without one.
     */
    watchForcedSignIn?: ForcedSignInWatch;
}

/**
 * A check made around a forced sign-in. Measured 2026-10-28: `aio auth login -f` sends
 * the browser through Adobe's logout first, which also ends the DA.live sign-in (an IMS
 * token of its own). Called just before the forced sign-in; the function it resolves to
 * is called once that sign-in has succeeded, and says whatever was lost itself.
 */
export type ForcedSignInWatch = () => Promise<() => Promise<void>>;

/** The error's own words, for the Debug Logs. */
const rawOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Start the watch, or nothing. A watch that fails never costs the SC the sign-in. */
async function startWatch(deps: AdobeSignInDeps): Promise<(() => Promise<void>) | undefined> {
    if (!deps.watchForcedSignIn) return undefined;
    try {
        return await deps.watchForcedSignIn();
    } catch (error) {
        deps.debugLogger.warn(`[Auth] The check before a forced sign-in failed: ${rawOf(error)}`);
        return undefined;
    }
}

/** Finish the watch the forced sign-in started. Never throws, for the same reason. */
async function finishWatch(deps: AdobeSignInDeps, afterForced: (() => Promise<void>) | undefined): Promise<void> {
    if (!afterForced) return;
    try {
        await afterForced();
    } catch (error) {
        deps.debugLogger.warn(`[Auth] The check after a forced sign-in failed: ${rawOf(error)}`);
    }
}

/**
 * Drop what the previous sign-in left cached, so the new token is read afresh:
 * the SDK client, the auth, validation and token-inspection caches, and the org
 * and org-list caches (org-list-cache-first would otherwise re-supply the old org
 * for the cache's short TTL, keeping the wizard on the wrong org).
 */
export function forgetPreviousSignIn(
    deps: Pick<AdobeSignInDeps, 'cacheManager' | 'sdkClient'>,
): void {
    deps.sdkClient.clear();
    deps.cacheManager.clearAuthStatusCache();
    deps.cacheManager.clearValidationCache();
    deps.cacheManager.clearTokenInspectionCache();
    deps.cacheManager.setCachedOrganization(undefined);
    deps.cacheManager.clearOrgListCache();
}

/**
 * Run `aio auth login` for as long as a person needs, handing on the link it prints
 * for when no browser opens, and stopping when the SC cancels (`signInSession`).
 * Streamed, so the link arrives while the command is still waiting; that also skips
 * the retry a plain call gets, and a sign-in is not something to repeat unasked.
 */
async function runLoginCommand(deps: AdobeSignInDeps, loginCommand: string): Promise<CommandResult> {
    const session = beginSignIn();
    let printed = '';
    try {
        return await deps.commandManager.execute(loginCommand, {
            encoding: 'utf8',
            timeout: TIMEOUTS.AUTH.SIGN_IN,
            streaming: true,
            signal: session.signal,
            onOutput: (text) => {
                printed += text;
                const link = signInLinkIn(printed);
                if (link) session.announceLink(link);
            },
        });
    } finally {
        session.end();
    }
}

/** One sign-in: open the browser and wait for it. Callers go through `login`. */
export async function runAdobeLogin(deps: AdobeSignInDeps, force: boolean): Promise<boolean> {
    const { cacheManager, sdkClient, debugLogger } = deps;
    return withTiming('login', async () => {
        try {
            const stepLogger = await deps.stepLogger();
            stepLogger.logTemplate('adobe-auth', 'operations.opening-browser', {});

            // If forced login, clear caches BEFORE login
            if (force) {
                cacheManager.clearAll();
                sdkClient.clear();
                debugLogger.debug(
                    '[Auth] Cleared caches before forced login (Adobe CLI will clear console context)',
                );
            }

            const loginCommand = force ? 'aio auth login -f' : 'aio auth login';
            const afterForced = force ? await startWatch(deps) : undefined;

            debugLogger.debug('[Auth] Executing login command, browser should open');
            stepLogger.logTemplate('adobe-auth', 'statuses.browser-opened', {});
            stepLogger.logTemplate('adobe-auth', 'operations.waiting-authentication', {});

            const result = await runLoginCommand(deps, loginCommand)
                .catch((error) => {
                    debugLogger.error('[Auth] Login command failed', error);
                    const formatted = AuthenticationErrorFormatter.formatError(error, {
                        operation: 'browser-auth',
                        timeout: TIMEOUTS.AUTH.SIGN_IN,
                    });
                    deps.logger.error(`[Auth] ${formatted.message}`);
                    debugLogger.debug(formatted.technical);
                    stepLogger.logTemplate('adobe-auth', 'error', {
                        item: 'Authentication',
                        error: formatted.title,
                    });
                    return null;
                });

            if (result && result.code === 0) {
                debugLogger.debug('[Auth] Login command completed successfully');
                const token = result.stdout?.trim();

                if (isValidTokenResponse(token)) {
                    debugLogger.debug('[Auth] Adobe CLI login successful (exit code 0)');
                    stepLogger.logTemplate('adobe-auth', 'statuses.authentication-complete', {});

                    // The forced path already cleared everything before it began.
                    if (force) {
                        sdkClient.clear();
                    } else {
                        forgetPreviousSignIn(deps);
                    }
                    debugLogger.debug(
                        '[Auth] Cleared the SDK client and auth caches so the new token is read afresh',
                    );

                    await finishWatch(deps, afterForced);
                    return true;
                } else {
                    debugLogger.warn('[Auth] Command succeeded but no valid token in output');
                    debugLogger.debug(
                        `[Auth] Output length: ${result.stdout?.length}, first 100 chars: ${result.stdout?.substring(0, 100)}`,
                    );
                }

                if (!force) {
                    debugLogger.debug(
                        '[Auth] Retrying with force flag to ensure fresh authentication',
                    );
                    stepLogger.logTemplate('adobe-auth', 'operations.retrying', {
                        item: 'authentication with fresh login',
                    });
                    // Inside the running sign-in, so not through the gate — it
                    // would join itself and never finish.
                    return await runAdobeLogin(deps, true);
                }
            } else {
                const exitCode = result?.code ?? 'unknown';
                debugLogger.debug(`[Auth] Login command failed with exit code: ${exitCode}`);
            }

            return false;
        } catch (error) {
            debugLogger.error('[Auth] Login failed', error as Error);
            deps.logger.error('[Auth] Adobe login failed', error as Error);
            return false;
        }
    });
}
