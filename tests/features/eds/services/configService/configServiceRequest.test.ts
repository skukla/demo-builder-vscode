/**
 * `requestConfigService` — one authenticated Config Service call, and what its
 * answer means.
 *
 * Moved from `configurationService.test.ts` on 2026-10-08 (EDS-8) with the code
 * it pins: the status-to-message mapping, the DELETE-404-is-success rule, the
 * missing-token refusal, and the failure log carrying Adobe's own reason.
 */

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
    },
}));

import {
    getImsToken,
    requestConfigService,
} from '@/features/eds/services/configService/configServiceRequest';
import { createMockLogger } from '../../../../helpers/loggerFake';

const URL_UNDER_TEST = 'https://admin.hlx.page/config/test-user/sites/my-site.json';
const TOKEN = 'ims-token';
const BODY = { version: 1 };

describe('requestConfigService', () => {
    const logger = createMockLogger();
    const tokenProvider = { getAccessToken: jest.fn() };
    let fetchSpy: jest.SpyInstance;

    const put = () => requestConfigService(tokenProvider, logger, 'PUT', URL_UNDER_TEST, BODY);
    const del = () => requestConfigService(tokenProvider, logger, 'DELETE', URL_UNDER_TEST);

    beforeEach(() => {
        jest.clearAllMocks();
        tokenProvider.getAccessToken.mockResolvedValue(TOKEN);
        fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockResolvedValue(new Response(null, { status: 200 }));
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    describe('the request it sends', () => {
        it('sends the bearer token, a JSON content type and the serialised body', async () => {
            const result = await put();

            expect(result).toEqual({ success: true, statusCode: 200 });
            expect(fetchSpy).toHaveBeenCalledWith(
                URL_UNDER_TEST,
                expect.objectContaining({
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${TOKEN}`,
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify(BODY),
                    signal: expect.any(AbortSignal),
                }),
            );
        });

        it('sends no content type and no body when there is nothing to send', async () => {
            await del();

            const init = fetchSpy.mock.calls[0][1];
            expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
            expect(init.body).toBeUndefined();
        });
    });

    describe('what a response means', () => {
        it('should return error for 401 unauthorized', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

            const result = await put();

            expect(result.success).toBe(false);
            expect(result.error).toContain('auth failed');
            expect(result.statusCode).toBe(401);
        });

        it('should return error for 403 forbidden', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));

            const result = await put();

            expect(result.success).toBe(false);
            expect(result.error).toContain('Not authorized');
            expect(result.statusCode).toBe(403);
        });

        it('should return error for 409 conflict (site exists)', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('Conflict', { status: 409 }));

            const result = await put();

            expect(result.success).toBe(false);
            expect(result.error).toContain('already exists');
            expect(result.statusCode).toBe(409);
        });

        // A 404 is only "already gone, treat as success" for a DELETE. On a PUT it is
        // a real failure, and the guard that says so is one `&&` away from turning
        // every failed registration into a silent success.
        it('reports a 404 on the PUT as a failure, not as an already-deleted config', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

            const result = await put();

            expect(result).toEqual({
                success: false,
                statusCode: 404,
                error: 'Configuration Service error (404): Not Found',
            });
        });

        it('should treat a 404 on a DELETE as success (already deleted)', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

            const result = await del();

            expect(result).toEqual({ success: true, statusCode: 404 });
        });

        it('carries the response body out for a status it has no specific message for', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('upstream exploded', { status: 500 }));

            const result = await put();

            expect(result.error).toBe('Configuration Service error (500): upstream exploded');
        });

        it('says "Unknown error" when such a response carries no body', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('', { status: 500 }));

            const result = await put();

            expect(result.error).toBe('Configuration Service error (500): Unknown error');
        });

        // Found by the 2026-10-08 mutation run: replacing the empty starting body
        // with any text survived, because no test made the body unreadable.
        it('says "Unknown error" when the response body cannot be read', async () => {
            const unreadable = new Response('', { status: 500 });
            jest.spyOn(unreadable, 'text').mockRejectedValue(new Error('stream broken'));
            fetchSpy.mockResolvedValueOnce(unreadable);

            const result = await put();

            expect(result).toEqual({
                success: false,
                statusCode: 500,
                error: 'Configuration Service error (500): Unknown error',
            });
        });

        it('should handle network errors', async () => {
            fetchSpy.mockRejectedValueOnce(new Error('Network timeout'));

            const result = await put();

            expect(result).toEqual({ success: false, error: 'Network timeout' });
        });

        it('refuses without calling the API when the IMS token is missing', async () => {
            tokenProvider.getAccessToken.mockResolvedValueOnce(null);

            const result = await put();

            expect(result.success).toBe(false);
            expect(result.error).toContain('DA.live authentication required');
            expect(fetchSpy).not.toHaveBeenCalled();
        });
    });
});

describe('getImsToken', () => {
    it('hands back the provider token', async () => {
        await expect(getImsToken({ getAccessToken: async () => TOKEN })).resolves.toBe(TOKEN);
    });

    it('throws when the provider has no token', async () => {
        await expect(getImsToken({ getAccessToken: async () => null })).rejects.toThrow(
            'DA.live authentication required',
        );
    });
});

/**
 * Config Service failure reporting.
 *
 * Field case (2026-07-28): a colleague's storefront failed four times with
 * `PUT /config/{org}/sites/{site}.json -> 403`, and the message told him to
 * install AEM Code Sync — on a run where code sync had been verified and 62
 * pages published seconds earlier. The advice was unfollowable, and the log
 * carried nothing to diagnose from: the 403 body is empty, and Adobe's stated
 * reason lives in the `x-error` header, which was discarded.
 *
 * Two requirements follow: record what Adobe actually said, and stop naming a
 * remedy the evidence contradicts.
 */
describe('requestConfigService — failure reporting', () => {
    const logger = createMockLogger();
    const tokenProvider = { getAccessToken: jest.fn().mockResolvedValue('ims-token') };
    let fetchSpy: jest.SpyInstance;

    const put = () => requestConfigService(tokenProvider, logger, 'PUT', URL_UNDER_TEST, BODY);

    function forbidden(headers: Record<string, string> = {}) {
        return new Response('', { status: 403, headers });
    }

    function loggedText(): string {
        return (['debug', 'info', 'warn', 'error'] as const)
            .flatMap((lvl) => logger[lvl].mock.calls)
            .map((c) => String(c[0]))
            .join('\n');
    }

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => fetchSpy?.mockRestore());

    it("records Adobe's stated reason from x-error", async () => {
        fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockResolvedValue(forbidden({ 'x-error': '[admin] not authorized' }));

        await put();

        expect(loggedText()).toContain('[admin] not authorized');
    });

    it("records Adobe's request id, which is what support needs", async () => {
        fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockResolvedValue(forbidden({ 'x-invocation-id': 'abc-123' }));

        await put();

        expect(loggedText()).toContain('abc-123');
    });

    it('does not tell the user to install AEM Code Sync', async () => {
        // The failing runs had code sync verified and publishing in the same
        // session. Naming it as the remedy sends people to reinstall a working
        // app — the exact loop this project already burned days on.
        fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(forbidden());

        const result = await put();

        expect(result.error).not.toMatch(/install AEM Code Sync/i);
        expect(result.error).not.toMatch(/aem\.live\/developer\/tutorial/i);
    });

    it('still explains a 403 and stays actionable', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(forbidden());

        const result = await put();

        expect(result.error).toMatch(/not authorized|permission|access/i);
        expect(result.statusCode).toBe(403);
    });

    it('tolerates a response carrying neither header', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(forbidden());

        await put();

        expect(loggedText()).not.toContain('undefined');
        expect(loggedText()).not.toContain('null');
    });
});
