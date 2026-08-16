/**
 * The shared-credential broker client.
 *
 * Asks `get-commerce-credentials` for the pair a demo project with no Adobe I/O
 * workspace cannot mint for itself. Everything here is about DEGRADING, not
 * succeeding: this call sits in front of a modal and inside project creation, so
 * every failure has to come back as "no credential" rather than as a throw, a
 * hang, or an error the user cannot act on.
 *
 * Strict TDD: written before the module exists.
 */

jest.mock('@/features/eds/services/accsDiscoveryConfig', () => ({
    selectCredentialService: jest.fn(),
}));

import {
    createProjectCredentialBroker,
    fetchSharedCommerceCredentials,
} from '@/features/data-installer/services/commerceCredentialBroker';
import { selectCredentialService } from '@/features/eds/services/accsDiscoveryConfig';

const mockedSelect = selectCredentialService as jest.MockedFunction<typeof selectCredentialService>;

const SERVICE_URL = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/get-commerce-credentials';
const CLIENT_ID = 'shared-client-id';
const CLIENT_SECRET = 'fake-test-secret-not-a-secret';

/** A fetch stand-in returning one canned response. */
function respondWith(body: unknown, status = 200): jest.Mock {
    return jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    });
}

const OK_BODY = { success: true, data: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET } };

function deps(overrides: Partial<Parameters<typeof fetchSharedCommerceCredentials>[0]> = {}) {
    return {
        serviceUrl: SERVICE_URL,
        getToken: jest.fn().mockResolvedValue('ims-token'),
        fetchImpl: respondWith(OK_BODY),
        log: jest.fn(),
        ...overrides,
    };
}

describe('fetchSharedCommerceCredentials', () => {
    it('returns the pair the service serves', async () => {
        const result = await fetchSharedCommerceCredentials(deps());

        expect(result).toEqual({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
    });

    it('sends the user IMS token as a bearer, on a GET', async () => {
        const fetchImpl = respondWith(OK_BODY);

        await fetchSharedCommerceCredentials(deps({ fetchImpl }));

        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe(SERVICE_URL);
        expect(init.method).toBe('GET');
        expect(init.headers.Authorization).toBe('Bearer ims-token');
    });

    // The credential path must not be able to hang a modal.
    it('bounds the request with a timeout signal', async () => {
        const fetchImpl = respondWith(OK_BODY);

        await fetchSharedCommerceCredentials(deps({ fetchImpl }));

        expect(fetchImpl.mock.calls[0][1].signal).toBeDefined();
    });

    it('returns undefined when there is no IMS token', async () => {
        const fetchImpl = respondWith(OK_BODY);
        const getToken = jest.fn().mockResolvedValue(undefined);

        const result = await fetchSharedCommerceCredentials(deps({ getToken, fetchImpl }));

        expect(result).toBeUndefined();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it.each([
        ['401 — token rejected', 401],
        ['403 — domain not allowed', 403],
        ['405 — wrong method', 405],
        ['503 — service not configured', 503],
        ['500 — service fault', 500],
    ])('returns undefined on %s', async (_label, status) => {
        const fetchImpl = respondWith({ success: false, error: 'nope' }, status);

        const result = await fetchSharedCommerceCredentials(deps({ fetchImpl }));

        expect(result).toBeUndefined();
    });

    it.each([
        ['success false', { success: false }],
        ['no data', { success: true }],
        ['half a pair — id only', { success: true, data: { clientId: CLIENT_ID } }],
        ['half a pair — secret only', { success: true, data: { clientSecret: CLIENT_SECRET } }],
        ['empty strings', { success: true, data: { clientId: '', clientSecret: '' } }],
        ['not JSON', 'a gateway error page'],
    ])('returns undefined on a 200 that is %s', async (_label, body) => {
        const fetchImpl = respondWith(body);

        const result = await fetchSharedCommerceCredentials(deps({ fetchImpl }));

        expect(result).toBeUndefined();
    });

    // Never throws: it runs in front of a modal and inside project creation.
    it.each([
        ['the network fails', new TypeError('fetch failed')],
        ['the request times out', Object.assign(new Error('aborted'), { name: 'AbortError' })],
    ])('returns undefined when %s', async (_label, error) => {
        const fetchImpl = jest.fn().mockRejectedValue(error);

        await expect(
            fetchSharedCommerceCredentials(deps({ fetchImpl })),
        ).resolves.toBeUndefined();
    });

    it('returns undefined when the token provider itself throws', async () => {
        const getToken = jest.fn().mockRejectedValue(new Error('no session'));

        await expect(fetchSharedCommerceCredentials(deps({ getToken }))).resolves.toBeUndefined();
    });

    describe('what reaches the log', () => {
        it('records the status so a 403 is diagnosable from Debug Logs alone', async () => {
            const log = jest.fn();
            const fetchImpl = respondWith({ success: false, error: 'Domain not authorized' }, 403);

            await fetchSharedCommerceCredentials(deps({ fetchImpl, log }));

            expect(log.mock.calls.flat().join(' ')).toContain('403');
        });

        it('never logs the pair', async () => {
            const log = jest.fn();

            await fetchSharedCommerceCredentials(deps({ log }));

            const logged = log.mock.calls.flat().join(' ');
            expect(logged).not.toContain(CLIENT_SECRET);
            expect(logged).not.toContain(CLIENT_ID);
        });

        // CONTROL: the log is actually being written to, so the assertion above
        // is not passing because nothing was logged at all.
        it('CONTROL — the success path does log something', async () => {
            const log = jest.fn();

            await fetchSharedCommerceCredentials(deps({ log }));

            expect(log).toHaveBeenCalled();
        });

        it('never logs the token', async () => {
            const log = jest.fn();
            const fetchImpl = respondWith({ success: false, error: 'x' }, 401);

            await fetchSharedCommerceCredentials(deps({ fetchImpl, log }));

            expect(log.mock.calls.flat().join(' ')).not.toContain('ims-token');
        });
    });
});

/**
 * The factory every call site uses.
 *
 * It decides which of the two broker failures applies, and that decision is the
 * reason `no-credential-service` exists at all — a settings problem the user can
 * fix must not read the same as a service that refused them.
 */
describe('createProjectCredentialBroker', () => {
    // NOT a default parameter: `auth(undefined)` would re-trigger a default and
    // hand back a token, which is exactly how the no-token case first passed
    // while asserting the opposite of what it claimed.
    const authWith = (token?: string) => ({
        getTokenManager: () => ({ inspectToken: jest.fn().mockResolvedValue({ token }) }),
    });
    const auth = () => authWith('ims-token');

    beforeEach(() => {
        jest.clearAllMocks();
        mockedSelect.mockReturnValue({ ok: true, serviceUrl: SERVICE_URL });
    });

    it('returns the pair when the service is configured and serves one', async () => {
        const broker = createProjectCredentialBroker({
            auth: auth(),
            fetchImpl: respondWith(OK_BODY) as unknown as typeof fetch,
        });

        await expect(broker()).resolves.toEqual({
            ok: true,
            credentials: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
        });
    });

    it('passes the project org through to selection', async () => {
        const broker = createProjectCredentialBroker({
            auth: auth(),
            orgId: '285361',
            fetchImpl: respondWith(OK_BODY) as unknown as typeof fetch,
        });

        await broker();

        expect(mockedSelect).toHaveBeenCalledWith('285361');
    });

    it.each([
        ['nothing configured', 'none-configured'],
        ['a non-https entry', 'invalid-url'],
        ['a URL that is not a discover-stores action', 'not-derivable'],
    ])('reports not-configured on %s', async (_label, reason) => {
        mockedSelect.mockReturnValue({ ok: false, reason: reason as 'none-configured' });
        const fetchImpl = respondWith(OK_BODY);

        const broker = createProjectCredentialBroker({
            auth: auth(),
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        await expect(broker()).resolves.toEqual({ ok: false, reason: 'not-configured' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    // No session is not a settings problem, so it must not tell the user to go
    // and configure a service they may already have configured correctly.
    it('reports unavailable when there is no authentication service', async () => {
        const broker = createProjectCredentialBroker({
            fetchImpl: respondWith(OK_BODY) as unknown as typeof fetch,
        });

        await expect(broker()).resolves.toEqual({ ok: false, reason: 'unavailable' });
    });

    it('reports unavailable when the session yields no token', async () => {
        const broker = createProjectCredentialBroker({
            auth: authWith(),
            fetchImpl: respondWith(OK_BODY) as unknown as typeof fetch,
        });

        await expect(broker()).resolves.toEqual({ ok: false, reason: 'unavailable' });
    });

    it('reports unavailable when the service refuses', async () => {
        const broker = createProjectCredentialBroker({
            auth: auth(),
            fetchImpl: respondWith({ success: false, error: 'nope' }, 403) as unknown as typeof fetch,
        });

        await expect(broker()).resolves.toEqual({ ok: false, reason: 'unavailable' });
    });
});
