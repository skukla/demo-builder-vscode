/**
 * DaLiveOrgOperations — how a refused or failed DA.live response becomes an error.
 *
 * Written before the class stopped carrying its own copy of the shared client's
 * `createErrorFromResponse` and `getImsToken` (PL-69 pair 9), and run against the
 * old code first: every message here is what an SC sees when a site delete or an
 * org listing fails, so the move must not change a word of it.
 */

// The shared client backs off between retries of a 5xx; mocked so a 500 is fast.
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import { DaLiveOrgOperations } from '@/features/eds/services/daLive/daLiveOrgOperations';
import { DaLiveAuthError, DaLiveError } from '@/features/eds/services/types';
import { createMockLogger } from '../../../../helpers/loggerFake';

const makeOps = (token: string | null = 'tok') =>
    new DaLiveOrgOperations(
        { getAccessToken: jest.fn().mockResolvedValue(token) },
        createMockLogger(),
    );

const respond = (status: number): void => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
        status,
        ok: status >= 200 && status < 300,
        statusText: '',
        headers: new Headers(),
        json: async () => [],
    } as unknown as Response);
};

/** The error a call rejected with, so its fields can be asserted together. */
async function rejection(call: Promise<unknown>): Promise<DaLiveError> {
    try {
        await call;
    } catch (error) {
        return error as DaLiveError;
    }
    throw new Error('expected the call to reject');
}

describe('DaLiveOrgOperations error mapping', () => {
    afterEach(() => jest.restoreAllMocks());

    it('refuses to start without a DA.live token', async () => {
        const error = await rejection(makeOps(null).deleteSite('org', 'site'));

        expect(error).toBeInstanceOf(DaLiveAuthError);
        expect(error.message).toBe('Not authenticated. Please log in to Adobe.');
    });

    it('reports an expired session on a 401 instead of mapping it', async () => {
        respond(401);

        const error = await rejection(makeOps().deleteSite('org', 'site'));

        expect(error).toBeInstanceOf(DaLiveAuthError);
        expect(error.message).toBe('DA.live token expired during operation');
    });

    it('maps a server error on delete to the try-again message', async () => {
        respond(500);

        const error = await rejection(makeOps().deleteSite('org', 'site'));

        expect(error).toBeInstanceOf(DaLiveError);
        expect(error.message).toBe(
            'Server error occurred while trying to delete site. Please try again later.',
        );
        expect(error.code).toBe('HTTP_500');
    });

    it('maps an unknown status on delete to the unexpected-error message', async () => {
        respond(418);

        const error = await rejection(makeOps().deleteSite('org', 'site'));

        expect(error.message).toBe('Unexpected error (418) while trying to delete site.');
        expect(error.code).toBe('HTTP_418');
    });

    it('keeps its own access-denied message for a 403 on delete', async () => {
        respond(403);

        const error = await rejection(makeOps().deleteSite('org', 'site'));

        expect(error.message).toBe('Access denied to organization. Check your permissions.');
        expect(error.code).toBe('ACCESS_DENIED');
    });

    it('maps a server error while listing sites', async () => {
        respond(502);

        const error = await rejection(makeOps().listOrgSites('org'));

        expect(error.message).toBe(
            'Server error occurred while trying to list organization sites. Please try again later.',
        );
        expect(error.code).toBe('HTTP_502');
    });
});
