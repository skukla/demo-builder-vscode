/**
 * Does the shared credential service exist, and will it serve THIS user?
 *
 * Diagnostics had no answer to either question, and the four states below are
 * indistinguishable to a user without one: they all end at the same
 * "add a client id and secret" message. They need three different people to fix.
 *
 * | State | Who fixes it |
 * |---|---|
 * | nothing configured | the user, in settings |
 * | configured, 403 | the service administrator, via the email allowlist |
 * | configured, unreachable | nobody yet — it is an outage |
 * | configured, 200 | nothing to fix |
 *
 * **The probe never reads the response body.** It reports whether the endpoint
 * answered, not what it answered with. A diagnostics report gets pasted into
 * tickets, and the body is a live Commerce credential.
 */

jest.mock('@/features/eds/services/accsDiscoveryConfig', () => ({
    selectCredentialService: jest.fn(),
}));

import { probeCredentialService } from '@/features/eds/services/credentialServiceProbe';
import { selectCredentialService } from '@/features/eds/services/accsDiscoveryConfig';

const mockedSelect = selectCredentialService as jest.MockedFunction<typeof selectCredentialService>;
const SERVICE_URL = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/get-commerce-credentials';
const SECRET = 'fake-live-secret-not-a-secret';

const auth = (token?: string) => ({
    getTokenManager: () => ({ inspectToken: jest.fn().mockResolvedValue({ token }) }),
});

function responder(status: number, body: unknown = { success: true }) {
    return jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockedSelect.mockReturnValue({ ok: true, serviceUrl: SERVICE_URL });
});

describe('probeCredentialService', () => {
    it('reports a working service', async () => {
        const result = await probeCredentialService({
            auth: auth('t'),
            orgId: '285361',
            fetchImpl: responder(200) as unknown as typeof fetch,
        });

        expect(result.configured).toBe(true);
        expect(result.orgId).toBe('285361');
        expect(result.endpoint?.httpStatus).toBe(200);
        expect(result.verdict).toMatch(/available/i);
    });

    /**
     * The probe asks with the user's OWN session, and asks for nothing else. A
     * request with no Authorization header would come back 401 and be reported
     * as "sign in again" — blaming the user for a call that was never made on
     * their behalf.
     */
    it('asks the configured URL with the user\'s bearer token', async () => {
        const fetchImpl = responder(200);

        await probeCredentialService({
            auth: auth('ims-token'),
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        expect(fetchImpl).toHaveBeenCalledWith(
            SERVICE_URL,
            expect.objectContaining({
                method: 'GET',
                headers: { Authorization: 'Bearer ims-token' },
            }),
        );
    });

    it.each([
        ['none-configured'],
        ['invalid-url'],
        ['not-derivable'],
    ])('reports not configured when selection fails with %s', async (reason) => {
        mockedSelect.mockReturnValue({ ok: false, reason: reason as 'none-configured' });
        const fetchImpl = responder(200);

        const result = await probeCredentialService({
            auth: auth('t'),
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        expect(result.configured).toBe(false);
        expect(result.reason).toBe(reason);
        expect(fetchImpl).not.toHaveBeenCalled();
        // The remedy has to name the setting, or "not configured" is a dead end.
        expect(result.verdict).toContain('demoBuilder.accsDiscovery.services');
    });

    // The state this whole check earns its cost for.
    it('names the allowlist as the remedy on 403', async () => {
        const result = await probeCredentialService({
            auth: auth('t'),
            fetchImpl: responder(403, { error: 'not authorized' }) as unknown as typeof fetch,
        });

        expect(result.endpoint?.httpStatus).toBe(403);
        expect(result.verdict).toMatch(/administrator/i);
    });

    /**
     * Four statuses, four different people to go and talk to. A status this
     * check cannot interpret says so, rather than borrowing a remedy that would
     * send someone to the wrong place.
     */
    it.each([
        [401, /session|sign in again/i],
        [503, /deployed but not configured/i],
        [500, /HTTP 500/],
    ])('reports HTTP %i in its own words', async (status, expected) => {
        const result = await probeCredentialService({
            auth: auth('t'),
            fetchImpl: responder(status) as unknown as typeof fetch,
        });

        expect(result.endpoint?.httpStatus).toBe(status);
        expect(result.verdict).toMatch(expected);
        expect(result.verdict).not.toMatch(/administrator/i);
    });

    /**
     * A timeout and a refused connection are different outages: one says the
     * service is slow or hanging, the other that nothing is listening. Reporting
     * either as the other sends the reader to check the wrong thing.
     */
    it('distinguishes an unreachable service from a refusal', async () => {
        const fetchImpl = jest.fn().mockRejectedValue(
            Object.assign(new Error('aborted'), { name: 'AbortError' }),
        );

        const result = await probeCredentialService({
            auth: auth('t'),
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        expect(result.endpoint?.httpStatus).toBeUndefined();
        expect(result.endpoint?.error).toBe('timed out');
        expect(result.verdict).not.toMatch(/administrator/i);
    });

    it('calls a connection failure that is not a timeout what it is', async () => {
        const fetchImpl = jest.fn().mockRejectedValue(new TypeError('fetch failed'));

        const result = await probeCredentialService({
            auth: auth('t'),
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        expect(result.endpoint?.error).toBe('could not connect');
    });

    it('reports a missing Adobe session without blaming the service', async () => {
        const fetchImpl = responder(200);

        const result = await probeCredentialService({
            auth: auth(undefined),
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        expect(result.configured).toBe(true);
        expect(result.verdict).toMatch(/sign in|not signed in/i);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    /**
     * A token manager that THROWS is the same situation as one that has no
     * token: the user is not signed in. It must not become an unhandled
     * rejection out of a diagnostics check.
     */
    it('treats a token lookup that throws as "not signed in"', async () => {
        const fetchImpl = responder(200);

        const result = await probeCredentialService({
            auth: {
                getTokenManager: () => ({
                    inspectToken: jest.fn().mockRejectedValue(new Error('IMS unavailable')),
                }),
            },
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        expect(result.configured).toBe(true);
        expect(result.verdict).toMatch(/sign in|not signed in/i);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    /**
     * A diagnostics report is pasted into tickets and Slack. It must be
     * impossible for a live Commerce credential to ride along.
     */
    it('never carries the served credential into the result', async () => {
        const result = await probeCredentialService({
            auth: auth('t'),
            fetchImpl: responder(200, {
                success: true,
                data: { clientId: 'live-id', clientSecret: SECRET },
            }) as unknown as typeof fetch,
        });

        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain(SECRET);
        expect(serialized).not.toContain('live-id');
    });

    // CONTROL: the serialization above is non-empty, so the assertion is real.
    it('CONTROL — the result does serialize something', async () => {
        const result = await probeCredentialService({
            auth: auth('t'),
            fetchImpl: responder(200) as unknown as typeof fetch,
        });

        expect(JSON.stringify(result).length).toBeGreaterThan(20);
    });

    it('never throws', async () => {
        const fetchImpl = jest.fn().mockRejectedValue(new TypeError('fetch failed'));

        await expect(
            probeCredentialService({
                auth: auth('t'),
                fetchImpl: fetchImpl as unknown as typeof fetch,
            }),
        ).resolves.toBeDefined();
    });
});
