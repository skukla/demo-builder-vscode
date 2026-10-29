/**
 * One sign-in run (`adobeSignIn.ts`), driven with handed-in deps (ADR-016 unit tier).
 *
 * Written 2026-10-08 when the flow moved out of `authenticationService.ts` and a
 * mutation run showed what the service suites had never constrained: that a FORCED
 * sign-in clears the caches before the browser opens, and that a sign-in which fails
 * (non-zero exit, or a thrown error) answers false. The service suites reach this code
 * through the gate and assert the gate's behaviour; these assert the run's.
 */
import { createMockAuthCacheManager, createMockSDKClient } from '../../../helpers/adobeAuthUnitsFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createFailureResult, createSuccessResult } from '../../../helpers/commandResultFake';
import { createMockDebugLogger } from '../../../helpers/debugLoggerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStepLogger } from './authenticationService.testUtils';
import { cancelSignIn, signInLink } from '@/core/auth/signInSession';
import type { ExecuteOptions } from '@/core/shell/types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    forgetPreviousSignIn,
    runAdobeLogin,
    type AdobeSignInDeps,
} from '@/features/authentication/services/adobeSignIn';

/** Long enough to pass `isValidTokenResponse` (> 50 characters, no "error"). */
const VALID_TOKEN = 'eyJ'.padEnd(120, 'x');

function buildDeps(): {
    deps: AdobeSignInDeps;
    execute: jest.Mock;
    cacheManager: ReturnType<typeof createMockAuthCacheManager>;
    sdkClient: ReturnType<typeof createMockSDKClient>;
} {
    const execute = jest.fn();
    const cacheManager = createMockAuthCacheManager({
        clearAuthStatusCache: jest.fn(),
        clearValidationCache: jest.fn(),
        clearTokenInspectionCache: jest.fn(),
        clearOrgListCache: jest.fn(),
    });
    const sdkClient = createMockSDKClient();
    const stepLogger = createMockStepLogger();
    const deps: AdobeSignInDeps = {
        commandManager: createMockCommandExecutor({ execute }),
        cacheManager,
        sdkClient,
        logger: createMockLogger(),
        debugLogger: createMockDebugLogger(),
        stepLogger: async () => stepLogger,
    };
    return { deps, execute, cacheManager, sdkClient };
}

describe('forgetPreviousSignIn', () => {
    it('drops the SDK client and every cache the old token fed', () => {
        const { deps, cacheManager, sdkClient } = buildDeps();

        forgetPreviousSignIn(deps);

        expect(sdkClient.clear).toHaveBeenCalledTimes(1);
        expect(cacheManager.clearAuthStatusCache).toHaveBeenCalledTimes(1);
        expect(cacheManager.clearValidationCache).toHaveBeenCalledTimes(1);
        expect(cacheManager.clearTokenInspectionCache).toHaveBeenCalledTimes(1);
        expect(cacheManager.setCachedOrganization).toHaveBeenCalledWith(undefined);
        expect(cacheManager.clearOrgListCache).toHaveBeenCalledTimes(1);
    });
});

describe('runAdobeLogin', () => {
    // 2026-10-23: no browser opened, the link aio printed was thrown away, and the
    // command was given one minute — then left running when that minute ran out.
    it('gives a person five minutes, hands on the link it prints, and can be cancelled', async () => {
        const { deps, execute } = buildDeps();
        const link = 'https://aio-login.example/applogin?id=abc';
        const waiting = signInLink();
        let abortedOnCancel: boolean | undefined;
        execute.mockImplementation(async (_command: string, options: ExecuteOptions) => {
            options.onOutput?.('  Visit this url to log in:\n');
            options.onOutput?.(`${link}\n- Waiting for browser login...\n`);
            cancelSignIn();
            abortedOnCancel = options.signal?.aborted;
            return createSuccessResult(VALID_TOKEN);
        });

        await runAdobeLogin(deps, false);

        await expect(waiting).resolves.toBe(link);
        expect(abortedOnCancel).toBe(true);
        expect(execute.mock.calls[0][1]).toEqual(
            expect.objectContaining({ timeout: TIMEOUTS.AUTH.SIGN_IN, streaming: true }),
        );
    });

    it('a plain sign-in that returns a token answers true and forgets the previous sign-in', async () => {
        const { deps, execute, cacheManager, sdkClient } = buildDeps();
        execute.mockResolvedValue(createSuccessResult(VALID_TOKEN));

        await expect(runAdobeLogin(deps, false)).resolves.toBe(true);

        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute.mock.calls[0][0]).toBe('aio auth login');
        // Not forced, so nothing is cleared until the new token is in hand.
        expect(cacheManager.clearAll).not.toHaveBeenCalled();
        expect(sdkClient.clear).toHaveBeenCalledTimes(1);
        expect(cacheManager.clearOrgListCache).toHaveBeenCalledTimes(1);
    });

    it('a forced sign-in clears every cache BEFORE the browser opens, and runs with -f', async () => {
        const { deps, execute, cacheManager, sdkClient } = buildDeps();
        const order: string[] = [];
        cacheManager.clearAll.mockImplementation(() => order.push('clearAll'));
        sdkClient.clear.mockImplementation(() => order.push('sdk.clear'));
        execute.mockImplementation(async () => {
            order.push('execute');
            return createSuccessResult(VALID_TOKEN);
        });

        await expect(runAdobeLogin(deps, true)).resolves.toBe(true);

        expect(execute.mock.calls[0][0]).toBe('aio auth login -f');
        // The stale org is the bug this ordering prevents: a forced login that
        // cleared AFTER the browser would re-supply the old org from cache.
        expect(order.slice(0, 3)).toStrictEqual(['clearAll', 'sdk.clear', 'execute']);
        // The forced path cleared everything up front; only the SDK client is
        // cleared again afterwards (so the new token is read), not the six-cache forget.
        expect(order).toStrictEqual(['clearAll', 'sdk.clear', 'execute', 'sdk.clear']);
        expect(cacheManager.clearOrgListCache).not.toHaveBeenCalled();
    });

    it('a sign-in whose output holds no token retries once, forced', async () => {
        const { deps, execute } = buildDeps();
        execute
            .mockResolvedValueOnce(createSuccessResult('Logged in, but no token printed'))
            .mockResolvedValueOnce(createSuccessResult(VALID_TOKEN));

        await expect(runAdobeLogin(deps, false)).resolves.toBe(true);

        expect(execute.mock.calls.map((c) => c[0])).toStrictEqual([
            'aio auth login',
            'aio auth login -f',
        ]);
    });

    it('a forced sign-in with no token does NOT retry, and answers false', async () => {
        const { deps, execute } = buildDeps();
        execute.mockResolvedValue(createSuccessResult('no token here'));

        await expect(runAdobeLogin(deps, true)).resolves.toBe(false);

        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('a non-zero exit answers false and clears nothing', async () => {
        const { deps, execute, cacheManager, sdkClient } = buildDeps();
        execute.mockResolvedValue(createFailureResult('user closed the browser'));

        await expect(runAdobeLogin(deps, false)).resolves.toBe(false);

        expect(sdkClient.clear).not.toHaveBeenCalled();
        expect(cacheManager.clearAll).not.toHaveBeenCalled();
        expect(cacheManager.clearOrgListCache).not.toHaveBeenCalled();
    });

    it('a command that rejects (timeout, missing CLI) answers false and tells the user', async () => {
        const { deps, execute } = buildDeps();
        execute.mockRejectedValue(new Error('spawn aio ENOENT'));

        await expect(runAdobeLogin(deps, false)).resolves.toBe(false);

        expect(execute).toHaveBeenCalledTimes(1);
        expect(deps.logger.error).toHaveBeenCalledTimes(1);
    });

    it('a step logger that cannot be built answers false rather than throwing', async () => {
        const { deps, execute } = buildDeps();
        deps.stepLogger = async () => {
            throw new Error('logging.json unreadable');
        };

        await expect(runAdobeLogin(deps, false)).resolves.toBe(false);

        expect(execute).not.toHaveBeenCalled();
        expect(deps.logger.error).toHaveBeenCalledTimes(1);
    });
});

// A forced sign-in also ends the DA.live sign-in (measured 2026-10-28). The watch is
// read on EVERY forced run, including the retry a normal sign-in falls back to, and
// never on a normal one.
describe('runAdobeLogin — the forced sign-in watch', () => {
    function watched() {
        const order: string[] = [];
        const after = jest.fn(async () => {
            order.push('after');
        });
        const watch = jest.fn(async () => {
            order.push('before');
            return after;
        });
        return { order, watch, after };
    }

    it('reads before the forced command and again once it succeeds', async () => {
        const { deps, execute } = buildDeps();
        const { order, watch, after } = watched();
        deps.watchForcedSignIn = watch;
        execute.mockImplementation(async () => {
            order.push('execute');
            return createSuccessResult(VALID_TOKEN);
        });

        await expect(runAdobeLogin(deps, true)).resolves.toBe(true);

        expect(order).toStrictEqual(['before', 'execute', 'after']);
        expect(after).toHaveBeenCalledTimes(1);
    });

    it('covers the forced retry a normal sign-in falls back to', async () => {
        const { deps, execute } = buildDeps();
        const { order, watch } = watched();
        deps.watchForcedSignIn = watch;
        execute.mockImplementation(async (command: string) => {
            order.push(command);
            return createSuccessResult(command.endsWith('-f') ? VALID_TOKEN : 'no token printed');
        });

        await expect(runAdobeLogin(deps, false)).resolves.toBe(true);

        expect(order).toStrictEqual(['aio auth login', 'before', 'aio auth login -f', 'after']);
    });

    it('is not read for a normal sign-in', async () => {
        const { deps, execute } = buildDeps();
        const { watch } = watched();
        deps.watchForcedSignIn = watch;
        execute.mockResolvedValue(createSuccessResult(VALID_TOKEN));

        await expect(runAdobeLogin(deps, false)).resolves.toBe(true);

        expect(watch).not.toHaveBeenCalled();
    });

    it('does not read the after-check when the forced sign-in fails', async () => {
        const { deps, execute } = buildDeps();
        const { watch, after } = watched();
        deps.watchForcedSignIn = watch;
        execute.mockResolvedValue(createFailureResult('user closed the browser'));

        await expect(runAdobeLogin(deps, true)).resolves.toBe(false);

        expect(watch).toHaveBeenCalledTimes(1);
        expect(after).not.toHaveBeenCalled();
    });

    it('never costs the SC the sign-in when the watch fails, before or after', async () => {
        const { deps, execute } = buildDeps();
        execute.mockResolvedValue(createSuccessResult(VALID_TOKEN));

        deps.watchForcedSignIn = jest.fn(async () => {
            throw new Error('keychain locked');
        });
        await expect(runAdobeLogin(deps, true)).resolves.toBe(true);

        deps.watchForcedSignIn = jest.fn(async () => async () => {
            throw new Error('IMS exploded');
        });
        await expect(runAdobeLogin(deps, true)).resolves.toBe(true);
        expect(deps.debugLogger.warn).toHaveBeenCalledTimes(2);
    });
});
