/**
 * siteConfigRegistrar — the 409/401/403 site-registration protocol.
 *
 * Three callers drive this (wizard, reset, repair), which is why it exists as one
 * function. Until this suite it had no direct coverage at all — its behaviour was
 * exercised only through two handler suites, and both of the bugs found in the
 * 2026-08-14 verify loop lived in branches neither of them reached:
 *
 *  - the 403 retry keyed off the FIRST response's status, but a site that already
 *    exists answers 409 and its real refusal arrives on the UPDATE. So the retry
 *    never ran for any existing site — every reset and every edit.
 *  - the same short-circuit inside the retry loop ended it after one attempt.
 *
 * Both are pinned below.
 */

import {
    registerSiteConfig,
    CONFIG_SERVICE_PROPAGATION_DELAYS_MS,
} from '@/features/eds/services/siteConfigRegistrar';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { Logger } from '@/types/logger';

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
} as unknown as Logger;

const siteParams = {
    org: 'owner',
    site: 'repo',
    codeOwner: 'owner',
    codeRepo: 'repo',
    contentSourceUrl: 'https://content.da.live/owner/repo/',
} as never;

function service(registerSite: jest.Mock, updateSiteConfig = jest.fn()) {
    return { registerSite, updateSiteConfig } as never;
}

const run = (svc: never, retryOn403 = false, onProgress?: (m: string) => void | Promise<void>) =>
    registerSiteConfig({
        configurationService: svc,
        siteParams,
        logger,
        retryOn403,
        onProgress,
    });

describe('registerSiteConfig', () => {
    beforeEach(() => jest.clearAllMocks());

    it('reports success when the site registers outright', async () => {
        const result = await run(service(jest.fn().mockResolvedValue({ success: true })));

        expect(result).toEqual({ registered: true });
    });

    it('falls through to an update on 409 and reports the update succeeding', async () => {
        const update = jest.fn().mockResolvedValue({ success: true });

        const result = await run(
            service(jest.fn().mockResolvedValue({ success: false, statusCode: 409 }), update),
        );

        expect(update).toHaveBeenCalledTimes(1);
        expect(result.registered).toBe(true);
    });

    it("carries the UPDATE's own status and error, not the handled 409's", async () => {
        // The rule that already caused one bug: reporting the 409 instead made a
        // 500 on the update print "not authorized" with a Code Sync deep link.
        const update = jest
            .fn()
            .mockResolvedValue({ success: false, statusCode: 500, error: 'upstream exploded' });

        const result = await run(
            service(
                jest
                    .fn()
                    .mockResolvedValue({ success: false, statusCode: 409, error: 'already exists' }),
                update,
            ),
        );

        expect(result.statusCode).toBe(500);
        expect(result.error).toBe('upstream exploded');
    });

    it('throws DaLiveAuthError on 401 rather than retrying a dead session', async () => {
        await expect(
            run(service(jest.fn().mockResolvedValue({ success: false, statusCode: 401 }))),
        ).rejects.toThrow(DaLiveAuthError);
    });

    it('does NOT retry a 403 when the caller did not ask for it', async () => {
        const register = jest.fn().mockResolvedValue({ success: false, statusCode: 403 });

        const result = await run(service(register), false);

        expect(register).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ registered: false, statusCode: 403, error: undefined });
    });

    it('retries an EXISTING site whose 403 arrives via the 409 update path', async () => {
        // The regression this pins: an existing site answers 409, so judging the
        // FIRST response's status meant the propagation retry never ran — for
        // every reset and every edit.
        const register = jest.fn().mockResolvedValue({ success: false, statusCode: 409 });
        const update = jest
            .fn()
            .mockResolvedValueOnce({ success: false, statusCode: 403 })
            .mockResolvedValueOnce({ success: true });

        const result = await run(service(register, update), true);

        expect(result.registered).toBe(true);
        expect(update).toHaveBeenCalledTimes(2);
    });

    it('carries lostGrants out of a success that arrived on the RETRY path', async () => {
        // The likely path for a repair, which always retries a 403. Collapsing
        // the retried outcome to `{registered:true}` reported a clean success
        // while the site's admin list had been destroyed.
        const register = jest.fn().mockResolvedValue({ success: false, statusCode: 409 });
        const update = jest
            .fn()
            .mockResolvedValueOnce({ success: false, statusCode: 403 })
            .mockResolvedValueOnce({
                success: true,
                grantsRestored: false,
                lostGrants: ['a****@x.test'],
            });

        const result = await run(service(register, update), true);

        expect(result.registered).toBe(true);
        expect(result.lostGrants).toEqual(['a****@x.test']);
    });

    it('keeps retrying across the full backoff instead of stopping after one attempt', async () => {
        const register = jest.fn().mockResolvedValue({ success: false, statusCode: 409 });
        const update = jest.fn().mockResolvedValue({ success: false, statusCode: 403 });

        const result = await run(service(register, update), true);

        // initial attempt + one per backoff step
        expect(update).toHaveBeenCalledTimes(1 + CONFIG_SERVICE_PROPAGATION_DELAYS_MS.length);
        expect(result).toEqual({ registered: false, statusCode: 403 });
    });

    it('stops retrying as soon as the refusal turns into something else', async () => {
        const register = jest.fn().mockResolvedValue({ success: false, statusCode: 409 });
        const update = jest
            .fn()
            .mockResolvedValueOnce({ success: false, statusCode: 403 })
            .mockResolvedValueOnce({ success: false, statusCode: 500, error: 'boom' });

        const result = await run(service(register, update), true);

        // A 500 will not improve with more waiting, and it must keep its own
        // status rather than being stamped 403 on the way out.
        expect(update).toHaveBeenCalledTimes(2);
        expect(result.statusCode).toBe(500);
    });

    it('throws DaLiveAuthError when the 409 UPDATE returns 401', async () => {
        // Only the FIRST response's 401 used to throw. An existing site always
        // answers 409 — "every reset and every edit" — so a dead session arrived
        // via the update and surfaced as a registration failure, and all three
        // callers then prescribed a reset instead of a sign-in.
        const register = jest.fn().mockResolvedValue({ success: false, statusCode: 409 });
        const update = jest.fn().mockResolvedValue({ success: false, statusCode: 401 });

        await expect(run(service(register, update), false)).rejects.toThrow(DaLiveAuthError);
    });

    it('carries lostGrants OUT ON the auth error', async () => {
        // The write can destroy the admin list and then fail to authenticate.
        // The throw is the only exit, so dropping them made the worst outcome —
        // config gone AND grants gone — the silent one.
        const register = jest.fn().mockResolvedValue({ success: false, statusCode: 409 });
        const update = jest.fn().mockResolvedValue({
            success: false,
            statusCode: 401,
            grantsRestored: false,
            lostGrants: ['a****@x.test'],
        });

        await expect(run(service(register, update), false)).rejects.toMatchObject({
            lostGrants: ['a****@x.test'],
        });
    });

    it('takes the plain-success exit when a RETRY registers outright', async () => {
        // Distinct from the 409->update exit: this is `registerSite` itself
        // succeeding on a later attempt, which every other loop test skips past.
        const register = jest
            .fn()
            .mockResolvedValueOnce({ success: false, statusCode: 403 })
            .mockResolvedValueOnce({ success: true });

        const result = await run(service(register), true);

        expect(result).toEqual({ registered: true });
        expect(register).toHaveBeenCalledTimes(2);
    });

    it('lets a session that dies DURING the backoff escape as DaLiveAuthError', async () => {
        // 135s is long enough for a token to expire mid-loop. It has to reach the
        // caller's re-auth path, not be folded into a registration failure.
        const register = jest
            .fn()
            .mockResolvedValueOnce({ success: false, statusCode: 403 })
            .mockResolvedValueOnce({ success: false, statusCode: 401 });

        await expect(run(service(register), true)).rejects.toThrow(DaLiveAuthError);
    });

    it('stops the loop on a non-409 failure that arrives on a retry', async () => {
        const register = jest
            .fn()
            .mockResolvedValueOnce({ success: false, statusCode: 403 })
            .mockResolvedValueOnce({ success: false, statusCode: 500, error: 'upstream' });

        const result = await run(service(register), true);

        expect(register).toHaveBeenCalledTimes(2);
        expect(result.statusCode).toBe(500);
        expect(result.error).toBe('upstream');
    });

    it('reports each retry through onProgress, which both real callers pass', async () => {
        const register = jest.fn().mockResolvedValue({ success: false, statusCode: 403 });
        const onProgress = jest.fn();

        await run(service(register), true, onProgress);

        expect(onProgress).toHaveBeenCalledTimes(CONFIG_SERVICE_PROPAGATION_DELAYS_MS.length);
        expect(onProgress).toHaveBeenCalledWith(
            expect.stringContaining('Waiting for Configuration Service access'),
        );
    });

    it('awaits an onProgress that returns a promise', async () => {
        let resolved = false;
        const onProgress = jest.fn().mockImplementation(async () => {
            await Promise.resolve();
            resolved = true;
        });

        await run(
            service(jest.fn().mockResolvedValue({ success: false, statusCode: 403 })),
            true,
            onProgress,
        );

        expect(resolved).toBe(true);
    });
});
