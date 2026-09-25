/**
 * waitForAppInstallation — the in-run wait for AEM Code Sync (EDS-20).
 *
 * `resolveAppInstallation` asks once and classifies; this asks again until the
 * App is there, the run is cancelled, or the wait is spent. It is what lets a
 * setup run pause at the install dialog and continue from the same line instead
 * of ending there and asking for a whole second run.
 *
 * Attempts are counted, not clocked, and `sleep` is mocked, so these pin the
 * SEQUENCE of checks and never a duration.
 */
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import { waitForAppInstallation } from '@/features/eds/services/appInstallationResolver';
import type { RepoInfo } from '@/features/eds/handlers/storefrontSetup/storefrontSetupTypes';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { createMockLogger } from '../../../helpers/loggerFake';

const REPO: RepoInfo = {
    repoOwner: 'acme-demos',
    repoName: 'aircraft-demo',
    repoUrl: 'https://github.com/acme-demos/aircraft-demo',
};

/** `isAppInstalled` answering the given results in order, repeating the last. */
function service(...results: Array<Record<string, unknown>>) {
    const isAppInstalled = jest.fn();
    results.forEach((r) => isAppInstalled.mockResolvedValueOnce(r));
    isAppInstalled.mockResolvedValue(results[results.length - 1]);
    return { isAppInstalled };
}

const NOT_YET = { isInstalled: false, codeStatus: 404 };
const INSTALLED = { isInstalled: true, codeStatus: 200 };

beforeEach(() => jest.clearAllMocks());

describe('installed', () => {
    it('sleeps before the first look — the App was definitively missing a moment ago', async () => {
        const svc = service(INSTALLED);
        const verdict = await waitForAppInstallation(svc, REPO, createMockLogger());
        expect(verdict).toBe('installed');
        expect(sleep).toHaveBeenCalledTimes(1);
        expect(svc.isAppInstalled).toHaveBeenCalledTimes(1);
    });

    it('keeps polling until the App is there', async () => {
        const svc = service(NOT_YET, NOT_YET, NOT_YET, INSTALLED);
        const verdict = await waitForAppInstallation(svc, REPO, createMockLogger());
        expect(verdict).toBe('installed');
        expect(svc.isAppInstalled).toHaveBeenCalledTimes(4);
        expect(svc.isAppInstalled).toHaveBeenCalledWith('acme-demos', 'aircraft-demo');
    });

    it('counts an initializing sync (code.status 400) as installed — Helix reports it installed', async () => {
        const svc = service({ isInstalled: true, codeStatus: 400 });
        expect(await waitForAppInstallation(svc, REPO, createMockLogger())).toBe('installed');
    });

    it('does not take a refused credential as an install', async () => {
        const svc = service({ isInstalled: false, transient: true, httpStatus: 401 }, INSTALLED);
        const verdict = await waitForAppInstallation(svc, REPO, createMockLogger());
        expect(verdict).toBe('installed');
        expect(svc.isAppInstalled).toHaveBeenCalledTimes(2);
    });

    it('polls at the shared code-sync cadence by default', async () => {
        await waitForAppInstallation(service(INSTALLED), REPO, createMockLogger());
        expect(sleep).toHaveBeenCalledWith(TIMEOUTS.EDS_CODE_SYNC_POLL);
    });
});

describe('aborted', () => {
    it('returns at once, without a look, when the run was already cancelled', async () => {
        const controller = new AbortController();
        controller.abort();
        const svc = service(INSTALLED);
        const verdict = await waitForAppInstallation(svc, REPO, createMockLogger(), {
            signal: controller.signal,
        });
        expect(verdict).toBe('aborted');
        expect(svc.isAppInstalled).not.toHaveBeenCalled();
    });

    it('stops within one poll when the run is cancelled mid-wait', async () => {
        const controller = new AbortController();
        // Built directly: a queued `mockResolvedValueOnce` would answer ahead of
        // the implementation and the abort would land one poll late.
        const svc = {
            isAppInstalled: jest.fn().mockImplementation(async () => {
                controller.abort();
                return NOT_YET;
            }),
        };
        const verdict = await waitForAppInstallation(svc, REPO, createMockLogger(), {
            signal: controller.signal,
        });
        expect(verdict).toBe('aborted');
        expect(svc.isAppInstalled).toHaveBeenCalledTimes(1);
    });
});

describe('timed out', () => {
    it('gives up after maxWait / poll checks', async () => {
        const svc = service(NOT_YET);
        const verdict = await waitForAppInstallation(svc, REPO, createMockLogger(), {
            pollMs: 1000,
            maxWaitMs: 4000,
        });
        expect(verdict).toBe('timed-out');
        expect(svc.isAppInstalled).toHaveBeenCalledTimes(4);
    });

    it('defaults to the shared 30-minute ceiling at the shared cadence', async () => {
        const svc = service(NOT_YET);
        await waitForAppInstallation(svc, REPO, createMockLogger());
        expect(svc.isAppInstalled).toHaveBeenCalledTimes(
            Math.ceil(TIMEOUTS.EDS_CODE_SYNC_INSTALL_WAIT / TIMEOUTS.EDS_CODE_SYNC_POLL),
        );
    });

    it('always looks at least once, however small the wait', async () => {
        const svc = service(INSTALLED);
        const verdict = await waitForAppInstallation(svc, REPO, createMockLogger(), {
            pollMs: 1000,
            maxWaitMs: 1,
        });
        expect(verdict).toBe('installed');
        expect(svc.isAppInstalled).toHaveBeenCalledTimes(1);
    });
});
