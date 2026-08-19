/**
 * configAccessRecovery tests — the 403 recovery that unblocks a refused user.
 *
 * The behaviour that matters is honesty under the ONE thing we cannot promise:
 * whether Adobe's Code Sync bot re-mints a role for an org that already exists.
 * The flow therefore VERIFIES (polls the oracle) instead of assuming, and says
 * "still refused" when it is still refused.
 */

import {
    announceConfigAccess,
    logConfigAccessState,
    waitForConfigAccess,
} from '@/features/eds/services/configAccessRecovery';
import type { Logger } from '@/types/logger';

jest.mock('@/features/eds/services/configServiceAccess', () => ({
    ...jest.requireActual('@/features/eds/services/configServiceAccess'),
    probeConfigWriteAccess: jest.fn(),
    readOrgAdmins: jest.fn(),
}));

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import {
    probeConfigWriteAccess,
    readOrgAdmins,
} from '@/features/eds/services/configServiceAccess';

const mockProbe = probeConfigWriteAccess as jest.Mock;
const mockReadOrgAdmins = readOrgAdmins as jest.Mock;

const logger: Logger = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

const tokenProvider = { getAccessToken: jest.fn().mockResolvedValue('ims-token') };

const SITE = {
    owner: 'leahrayard',
    repo: 'leah-b2b-demo',
    contentSourceUrl: 'https://content.da.live/leahrayard/leah-b2b-demo/',
    userEmail: 'teammate@example.test',
};

beforeEach(() => {
    jest.clearAllMocks();
    mockReadOrgAdmins.mockResolvedValue({ status: 'not_authorized' });
});

describe('waitForConfigAccess', () => {
    it('resolves granted as soon as the oracle flips', async () => {
        mockProbe.mockResolvedValueOnce('refused').mockResolvedValueOnce('granted');

        const result = await waitForConfigAccess(tokenProvider, SITE, logger);

        expect(result).toBe('granted');
        expect(mockProbe).toHaveBeenCalledTimes(2);
    });

    /**
     * Polling waits for an admin role to propagate. A refused SESSION will never
     * propagate into a role, so the wait is pure cost — three sleeps totalling
     * ~105s before telling the user the wrong thing. Stop on the first 401.
     */
    it('stops immediately on a refused session rather than polling for a role', async () => {
        mockProbe.mockResolvedValue('unauthenticated');

        const result = await waitForConfigAccess(tokenProvider, SITE, logger);

        expect(result).toBe('unauthenticated');
        expect(mockProbe).toHaveBeenCalledTimes(1);
    });

    it('gives up as STILL REFUSED rather than reporting success', async () => {
        // The load-bearing case: if the bot does not re-mint for an existing org,
        // this poll never flips — and claiming success there would send the user
        // back to a storefront that still cannot serve a PDP.
        mockProbe.mockResolvedValue('refused');

        const result = await waitForConfigAccess(tokenProvider, SITE, logger);

        expect(result).toBe('refused');
    });

    it('reports progress on each attempt so a long wait is not silent', async () => {
        mockProbe.mockResolvedValue('refused');
        const onAttempt = jest.fn();

        await waitForConfigAccess(tokenProvider, SITE, logger, onAttempt);

        expect(onAttempt).toHaveBeenCalled();
        const [attempt, total] = onAttempt.mock.calls[0];
        expect(attempt).toBe(1);
        expect(total).toBeGreaterThan(1);
    });

    it('treats an indeterminate probe as not-yet-granted and keeps waiting', async () => {
        mockProbe
            .mockResolvedValueOnce('unknown')
            .mockResolvedValueOnce('unknown')
            .mockResolvedValueOnce('granted');

        const result = await waitForConfigAccess(tokenProvider, SITE, logger);

        expect(result).toBe('granted');
    });
});

/**
 * The telegraph.
 *
 * Access state used to be discovered only when a write failed, deep in phase 3
 * after code had already been pushed — so the debug log a colleague sends you
 * was silent about the single fact that explains the whole run. This states it
 * up front, every run, in the channel triage actually reads.
 */
describe('logConfigAccessState', () => {
    it('states plainly that access is held', async () => {
        mockProbe.mockResolvedValue('granted');

        const state = await logConfigAccessState(tokenProvider, SITE, logger);

        expect(state).toBe('granted');
        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining('leahrayard/leah-b2b-demo'),
        );
        expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/admin access confirmed/i));
    });

    it('warns with the consequence, not just the status, when refused', async () => {
        // "403" alone taught nobody anything. The line has to say what it costs.
        mockProbe.mockResolvedValue('refused');

        const state = await logConfigAccessState(tokenProvider, SITE, logger);

        expect(state).toBe('refused');
        const warned = (logger.warn as jest.Mock).mock.calls.flat().join(' ');
        expect(warned).toMatch(/no admin role/i);
        expect(warned).toMatch(/product pages|PDP/i);
    });

    it('does not claim either way when the probe cannot answer', async () => {
        mockProbe.mockResolvedValue('unknown');

        const state = await logConfigAccessState(tokenProvider, SITE, logger);

        expect(state).toBe('unknown');
        expect(logger.warn).not.toHaveBeenCalled();
    });
});

describe('a refused session is not a missing role', () => {
    it('logConfigAccessState says re-auth, never "no admin role"', async () => {
        mockProbe.mockResolvedValue('unauthenticated');

        await logConfigAccessState(tokenProvider, SITE, logger);

        const warned = JSON.stringify((logger.warn as jest.Mock).mock.calls);
        expect(warned).not.toMatch(/no admin role/i);
        expect(warned).toMatch(/sign in|session/i);
    });

    /**
     * The announcement offers "an org admin can grant it: …". For a dead session
     * that is a false remedy — the identity already HAS the role. Naming people
     * to go ask is worse than saying nothing.
     */
    it('announceConfigAccess does not name org admins for a refused session', async () => {
        mockProbe.mockResolvedValue('unauthenticated');
        const announce = jest.fn().mockResolvedValue(undefined);

        await announceConfigAccess(tokenProvider, SITE, logger, announce);

        const said = JSON.stringify(announce.mock.calls);
        expect(said).not.toMatch(/admin role/i);
        expect(said).toMatch(/sign in/i);
    });
});
