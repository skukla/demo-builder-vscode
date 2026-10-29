/**
 * adobeEntityReads — the SDK-first read path every entity listing shares.
 *
 * `SdkEntityFetch` answers "did the SDK answer, and with what?" for one bounded
 * SDK call: `undefined` means "could not answer" (the caller then tries the CLI),
 * and an empty array is a real answer that must stay distinguishable from it.
 * Driven directly with a handed-in SDK client (ADR-016 unit tier).
 */

import {
    ensureSDKReady,
    resolveEffectiveOrgId,
    SdkEntityFetch,
} from '@/features/authentication/services/adobeEntityReads';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AdobeOrg, SDKResponse } from '@/features/authentication/services/types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const ORG: AdobeOrg = { id: 'org-1', code: 'ORG1@AdobeOrg', name: 'Org 1' };

/** An SDK client reporting `initialized`, and recording initialisation. */
function sdkClient(initialized: boolean): jest.Mocked<AdobeSDKClient> {
    return {
        isInitialized: jest.fn().mockReturnValue(initialized),
        ensureInitialized: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<AdobeSDKClient>;
}

/** Maps raw names to upper case, so a test can see the mapper ran. */
const upper = (raw: string[]): string[] => raw.map((r) => r.toUpperCase());

describe('ensureSDKReady', () => {
    it('initialises the SDK when it is not ready yet', async () => {
        const client = sdkClient(false);

        await ensureSDKReady(client);

        expect(client.ensureInitialized).toHaveBeenCalledTimes(1);
    });

    it('leaves an initialised SDK alone', async () => {
        const client = sdkClient(true);

        await ensureSDKReady(client);

        expect(client.ensureInitialized).not.toHaveBeenCalled();
    });
});

describe('SdkEntityFetch.trySDKFetch', () => {
    it('answers undefined WITHOUT calling the SDK when it is not initialised', async () => {
        const call = jest.fn();

        const result = await new SdkEntityFetch(sdkClient(false)).trySDKFetch(call, upper, 'orgs', 0);

        expect(result).toBeUndefined();
        expect(call).not.toHaveBeenCalled();
    });

    it('maps the SDK body when the SDK answers', async () => {
        const call = jest.fn().mockResolvedValue({ body: ['a', 'b'] } as SDKResponse<string[]>);

        const result = await new SdkEntityFetch(sdkClient(true)).trySDKFetch(call, upper, 'orgs', 0);

        expect(result).toStrictEqual(['A', 'B']);
    });

    it('answers an EMPTY body as [] — a real answer, not "could not answer"', async () => {
        const call = jest.fn().mockResolvedValue({ body: [] } as SDKResponse<string[]>);

        const result = await new SdkEntityFetch(sdkClient(true)).trySDKFetch(call, upper, 'orgs', 0);

        expect(result).toStrictEqual([]);
    });

    it('answers undefined when the SDK call fails', async () => {
        const call = jest.fn().mockRejectedValue(new Error('gateway 502'));

        const result = await new SdkEntityFetch(sdkClient(true)).trySDKFetch(call, upper, 'orgs', 0);

        expect(result).toBeUndefined();
    });

    it('answers undefined when the SDK call fails with a non-Error value', async () => {
        const call = jest.fn().mockRejectedValue('plain string');

        const result = await new SdkEntityFetch(sdkClient(true)).trySDKFetch(call, upper, 'orgs', 0);

        expect(result).toBeUndefined();
    });

    it('answers undefined when the SDK resolves with no response at all', async () => {
        const call = jest.fn().mockResolvedValue(undefined);

        const result = await new SdkEntityFetch(sdkClient(true)).trySDKFetch(call, upper, 'orgs', 0);

        expect(result).toBeUndefined();
    });

    it('answers undefined when the body is not an array', async () => {
        const call = jest.fn().mockResolvedValue({ body: { not: 'a list' } });

        const result = await new SdkEntityFetch(sdkClient(true)).trySDKFetch(call, upper, 'orgs', 0);

        expect(result).toBeUndefined();
    });

    it('answers undefined when the body is missing', async () => {
        const call = jest.fn().mockResolvedValue({});

        const result = await new SdkEntityFetch(sdkClient(true)).trySDKFetch(call, upper, 'orgs', 0);

        expect(result).toBeUndefined();
    });

    it('gives up at the deadline instead of waiting for a stalled SDK', async () => {
        jest.useFakeTimers();
        try {
            const call = jest.fn().mockReturnValue(new Promise(() => {}));

            const pending = new SdkEntityFetch(sdkClient(true)).trySDKFetch(call, upper, 'orgs', 0);
            await jest.advanceTimersByTimeAsync(TIMEOUTS.SDK_ENTITY_FETCH + 1);

            await expect(pending).resolves.toBeUndefined();
        } finally {
            jest.useRealTimers();
        }
    });

    it('uses an SDK answer that arrives just inside the deadline', async () => {
        jest.useFakeTimers();
        try {
            const late = new Promise<SDKResponse<string[]>>((resolve) =>
                setTimeout(() => resolve({ body: ['late'] } as SDKResponse<string[]>), TIMEOUTS.SDK_ENTITY_FETCH - 1),
            );
            const call = jest.fn().mockReturnValue(late);

            const pending = new SdkEntityFetch(sdkClient(true)).trySDKFetch(call, upper, 'orgs', 0);
            await jest.advanceTimersByTimeAsync(TIMEOUTS.SDK_ENTITY_FETCH - 1);

            await expect(pending).resolves.toStrictEqual(['LATE']);
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('resolveEffectiveOrgId', () => {
    it('uses the preferred org id without consulting the token org', async () => {
        const tokenOrgs = jest.fn();

        await expect(resolveEffectiveOrgId('threaded', tokenOrgs)).resolves.toBe('threaded');
        expect(tokenOrgs).not.toHaveBeenCalled();
    });

    it('falls back to the token org when the preferred id is empty', async () => {
        const tokenOrgs = jest.fn().mockResolvedValue([ORG]);

        await expect(resolveEffectiveOrgId('', tokenOrgs)).resolves.toBe('org-1');
    });

    it('falls back to the token org when there is no preferred id', async () => {
        const tokenOrgs = jest.fn().mockResolvedValue([ORG]);

        await expect(resolveEffectiveOrgId(undefined, tokenOrgs)).resolves.toBe('org-1');
    });

    it('answers undefined when the SDK could not list orgs', async () => {
        const tokenOrgs = jest.fn().mockResolvedValue(undefined);

        await expect(resolveEffectiveOrgId(undefined, tokenOrgs)).resolves.toBeUndefined();
    });

    it('answers undefined when the token reaches no orgs', async () => {
        const tokenOrgs = jest.fn().mockResolvedValue([]);

        await expect(resolveEffectiveOrgId(undefined, tokenOrgs)).resolves.toBeUndefined();
    });
});
