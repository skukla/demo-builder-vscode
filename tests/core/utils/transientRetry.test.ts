/**
 * withOneTransientRetry — the one Console retry, shared.
 *
 * Extracted 2026-09-24 from adobeOrgServices when the deploy-time credential
 * read turned out to have no retry while the subscribe before it did. The
 * cases pin the contract both callers rely on: one retry, only for a
 * transient failure, after the configured pause, with a warning that names
 * the call.
 */

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { withOneTransientRetry } from '@/core/utils/transientRetry';

const GATEWAY_TIMEOUT = new Error(
    '[CoreConsoleAPISDK:ERROR_GET_INTEGRATION] 504 - Gateway Timeout ("upstream request timeout")',
);

describe('withOneTransientRetry', () => {
    beforeEach(() => jest.clearAllMocks());

    it('a first-try success is answered without sleeping or re-calling', async () => {
        const run = jest.fn().mockResolvedValue('ok');
        const warn = jest.fn();

        await expect(withOneTransientRetry('read', run, warn)).resolves.toBe('ok');

        expect(run).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });

    it('a 504 is retried once after the configured pause, and the second answer lands', async () => {
        const run = jest.fn().mockRejectedValueOnce(GATEWAY_TIMEOUT).mockResolvedValueOnce('second');
        const warn = jest.fn();

        await expect(withOneTransientRetry('getIntegration', run, warn)).resolves.toBe('second');

        expect(run).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledWith(TIMEOUTS.ORG_SERVICES_RETRY_DELAY);
        expect(warn).toHaveBeenCalledWith('getIntegration failed transiently — retrying once');
    });

    it('a refusal is thrown at once, never retried', async () => {
        const refused = new Error('403 Forbidden — not entitled');
        const run = jest.fn().mockRejectedValue(refused);
        const warn = jest.fn();

        await expect(withOneTransientRetry('read', run, warn)).rejects.toBe(refused);

        expect(run).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });

    it('two transient failures in a row fail with the second error, rather than retrying forever', async () => {
        const second = new Error('504 Gateway Timeout (again)');
        const run = jest.fn().mockRejectedValueOnce(GATEWAY_TIMEOUT).mockRejectedValueOnce(second);

        await expect(withOneTransientRetry('read', run, jest.fn())).rejects.toBe(second);

        expect(run).toHaveBeenCalledTimes(2);
    });
});
