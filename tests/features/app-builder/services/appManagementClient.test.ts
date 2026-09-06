/**
 * App Management API Client Tests
 *
 * Verifies the pure-fetch client for a deployed app's App Management API:
 * - Exact header assembly (Bearer + x-gw-ims-org-id; Content-Type on bodies)
 * - getInstallationState: 204 → undefined, 200 state passthrough
 * - reconcileInstallation: 202 queued / 200 upgrade-plan results; the 409
 *   no-op reason parsed against the spec's closed enum (unknown → undefined)
 * - validateInstallation / setAssociation request+response contracts
 * - Sanitized errors: status + label only; the token never leaks
 *
 * Fixtures follow the published OpenAPI spec (adobe/aio-commerce-sdk,
 * packages/aio-commerce-lib-app/docs/openapi.json, "App Management API"
 * v3.0.0, fetched 2026-08-27) — field sets match each schema's `required`
 * list. All auth values are obviously fake — this repo is public.
 */

import {
    AppManagementApiError,
    AppManagementClient,
    type AppData,
    type AppManagementAuth,
    type ReconcileInstallationRequest,
    type ValidateInstallationRequest,
} from '@/features/app-builder/services/appManagementClient';

const FAKE_TOKEN = 'fake-test-token-not-a-secret';
const FAKE_ORG = 'FAKEORG123@AdobeOrg';
const BASE_URL = 'https://example.adobeioruntime.net/api/v1/web/app-management';

const AUTH: AppManagementAuth = { accessToken: FAKE_TOKEN, imsOrgId: FAKE_ORG };

const EXPECTED_GET_HEADERS = {
    Authorization: `Bearer ${FAKE_TOKEN}`,
    'x-gw-ims-org-id': FAKE_ORG,
    Accept: 'application/json',
};

const EXPECTED_POST_HEADERS = {
    ...EXPECTED_GET_HEADERS,
    'Content-Type': 'application/json',
};

/** AppData with every spec-required field (AppData.required lists all 8). */
const APP_DATA: AppData = {
    consumerOrgId: '285361',
    orgName: 'Test Org',
    projectId: 'proj-1',
    projectName: 'testproject',
    projectTitle: 'Test Project',
    workspaceId: 'ws-1',
    workspaceName: 'Stage',
    workspaceTitle: 'Stage',
};

const RECONCILE_REQUEST: ReconcileInstallationRequest = {
    appData: APP_DATA,
    ioEventsUrl: 'https://api.adobe.io/events',
    ioEventsEnv: 'prod',
    commerceBaseUrl: 'https://example.commerce.test',
    commerceEnv: 'saas',
};

const VALIDATE_REQUEST: ValidateInstallationRequest = {
    appData: APP_DATA,
    commerceBaseUrl: 'https://example.commerce.test',
    commerceEnv: 'saas',
    ioEventsUrl: 'https://api.adobe.io/events',
    ioEventsEnv: 'prod',
};

/** Build a stub fetch Response with a JSON body. */
function jsonResponse(status: number, body: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: 'Stub',
        json: jest.fn().mockResolvedValue(body),
    } as unknown as Response;
}

/**
 * A real 204 carries NO body, so `json()` rejects. Stubbing it as JSON-that-
 * resolves-undefined made the 204 short-circuit indistinguishable from falling
 * through to `parseJson` — both answered `undefined`.
 */
function noContentResponse(): Response {
    return {
        ok: true,
        status: 204,
        statusText: 'No Content',
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
    } as unknown as Response;
}

/** Build a stub fetch Response whose body is not valid JSON. */
function nonJsonResponse(status: number): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: 'Stub',
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON')),
    } as unknown as Response;
}

function makeClient(mockFetch: jest.Mock, baseUrl = BASE_URL): AppManagementClient {
    return new AppManagementClient(baseUrl, AUTH, mockFetch as unknown as typeof fetch);
}

describe('appManagementClient', () => {
    let mockFetch: jest.Mock;

    beforeEach(() => {
        mockFetch = jest.fn();
    });

    describe('getInstallationState', () => {
        it('GETs /installation with Bearer + x-gw-ims-org-id and no body', async () => {
            mockFetch.mockResolvedValue(jsonResponse(204, undefined));

            await makeClient(mockFetch).getInstallationState();

            expect(mockFetch).toHaveBeenCalledWith(
                `${BASE_URL}/installation`,
                expect.objectContaining({
                    method: 'GET',
                    headers: EXPECTED_GET_HEADERS,
                    body: undefined,
                })
            );
        });

        it('returns undefined for a 204 (never installed)', async () => {
            mockFetch.mockResolvedValue(jsonResponse(204, undefined));

            await expect(makeClient(mockFetch).getInstallationState()).resolves.toBeUndefined();
        });

        /**
         * The 204 is decided from the STATUS, before anything reads the body. A
         * real 204 has no body at all, so falling through to `parseJson` would
         * throw rather than answer `undefined`.
         */
        it('never reads the body of a 204', async () => {
            const response = noContentResponse();
            mockFetch.mockResolvedValue(response);

            await expect(makeClient(mockFetch).getInstallationState()).resolves.toBeUndefined();
            expect(response.json).not.toHaveBeenCalled();
        });

        it('passes a succeeded state through (spec-required fields intact)', async () => {
            // GET /installation 200, "succeeded" variant — required:
            // id, status, startedAt, completedAt, step, data.
            const state = {
                id: 'inst-1',
                status: 'succeeded',
                startedAt: '2026-08-27T10:00:00Z',
                completedAt: '2026-08-27T10:05:00Z',
                step: {
                    name: 'root',
                    id: 'root',
                    path: [],
                    status: 'succeeded',
                    children: [],
                },
                data: {},
            };
            mockFetch.mockResolvedValue(jsonResponse(200, state));

            await expect(makeClient(mockFetch).getInstallationState()).resolves.toEqual(state);
        });

        it('trims a trailing slash off the base URL', async () => {
            mockFetch.mockResolvedValue(jsonResponse(204, undefined));

            await makeClient(mockFetch, `${BASE_URL}/`).getInstallationState();

            expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/installation`);
        });

        // EVERY trailing slash, not just the last one: a base URL pasted from a
        // browser can end in more than one, and `//installation` is a 404.
        it('trims a run of trailing slashes, not only the final one', async () => {
            mockFetch.mockResolvedValue(jsonResponse(204, undefined));

            await makeClient(mockFetch, `${BASE_URL}///`).getInstallationState();

            expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/installation`);
        });
    });

    describe('reconcileInstallation', () => {
        it('POSTs the request body verbatim with Content-Type', async () => {
            mockFetch.mockResolvedValue(
                jsonResponse(202, {
                    message: 'queued',
                    operation: 'install',
                    id: 'inst-1',
                    status: 'in-progress',
                })
            );

            await makeClient(mockFetch).reconcileInstallation(RECONCILE_REQUEST);

            expect(mockFetch).toHaveBeenCalledWith(
                `${BASE_URL}/installation`,
                expect.objectContaining({
                    method: 'POST',
                    headers: EXPECTED_POST_HEADERS,
                    body: JSON.stringify(RECONCILE_REQUEST),
                })
            );
        });

        it('returns the queued 202 install result', async () => {
            mockFetch.mockResolvedValue(
                jsonResponse(202, { message: 'queued', operation: 'install', id: 'inst-1' })
            );

            const result = await makeClient(mockFetch).reconcileInstallation(RECONCILE_REQUEST);

            expect(result.operation).toBe('install');
            expect(result.id).toBe('inst-1');
        });

        it('returns the 200 upgrade plan', async () => {
            // 200 required: message, operation ('upgrade'), plan.
            mockFetch.mockResolvedValue(
                jsonResponse(200, {
                    message: 'planned',
                    operation: 'upgrade',
                    plan: { events: {} },
                })
            );

            const result = await makeClient(mockFetch).reconcileInstallation(RECONCILE_REQUEST);

            expect(result.operation).toBe('upgrade');
            expect(result.plan).toEqual({ events: {} });
        });

        it('throws a 409 no-op with the closed-enum reason attached', async () => {
            mockFetch.mockResolvedValue(
                jsonResponse(409, { message: 'nothing to do', reason: 'already-current' })
            );

            const failure = makeClient(mockFetch).reconcileInstallation(RECONCILE_REQUEST);

            await expect(failure).rejects.toThrow(AppManagementApiError);
            await expect(failure).rejects.toMatchObject({ status: 409, reason: 'already-current' });
        });

        it('drops a 409 reason outside the spec enum (no body text surfaced)', async () => {
            mockFetch.mockResolvedValue(
                jsonResponse(409, { message: 'conflict', reason: 'weird-new-reason' })
            );

            await expect(
                makeClient(mockFetch).reconcileInstallation(RECONCILE_REQUEST)
            ).rejects.toMatchObject({ status: 409, reason: undefined });
        });
    });

    describe('validateInstallation', () => {
        it('POSTs to /installation/validation and returns the outcome', async () => {
            const outcome = {
                valid: true,
                summary: { totalIssues: 0, errors: 0, warnings: 0 },
            };
            mockFetch.mockResolvedValue(jsonResponse(200, outcome));

            const result = await makeClient(mockFetch).validateInstallation(VALIDATE_REQUEST);

            expect(result).toEqual(outcome);
            expect(mockFetch).toHaveBeenCalledWith(
                `${BASE_URL}/installation/validation`,
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify(VALIDATE_REQUEST),
                })
            );
        });
    });

    describe('setAssociation', () => {
        it('POSTs to /association and resolves on 204', async () => {
            mockFetch.mockResolvedValue(jsonResponse(204, undefined));

            await expect(
                makeClient(mockFetch).setAssociation({
                    commerceBaseUrl: 'https://example.commerce.test',
                    commerceEnv: 'saas',
                })
            ).resolves.toBeUndefined();

            expect(mockFetch).toHaveBeenCalledWith(
                `${BASE_URL}/association`,
                expect.objectContaining({ method: 'POST' })
            );
        });

        it('throws a sanitized typed error on 400', async () => {
            mockFetch.mockResolvedValue(
                jsonResponse(400, { message: 'secret-bearing upstream detail' })
            );

            const failure = makeClient(mockFetch).setAssociation({
                commerceBaseUrl: 'https://example.commerce.test',
                commerceEnv: 'saas',
            });

            await expect(failure).rejects.toThrow('Set association failed (HTTP 400)');
            await expect(failure).rejects.not.toThrow(/secret-bearing/);
        });
    });

    describe('uninstallation (AB-4)', () => {
        it('GET /installation/uninstallation: 204 → undefined, 200 → state', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(204, undefined));
            await expect(makeClient(mockFetch).getUninstallationState()).resolves.toBeUndefined();

            const state = { id: 'u-1', status: 'succeeded', startedAt: '2026-08-27T00:00:00Z' };
            mockFetch.mockResolvedValueOnce(jsonResponse(200, state));
            await expect(makeClient(mockFetch).getUninstallationState()).resolves.toEqual(state);
            expect(mockFetch).toHaveBeenLastCalledWith(
                `${BASE_URL}/installation/uninstallation`,
                expect.objectContaining({ method: 'GET', headers: EXPECTED_GET_HEADERS })
            );
        });

        it('POSTs /installation/uninstallation with the full required body', async () => {
            mockFetch.mockResolvedValue(jsonResponse(202, { message: 'queued', id: 'u-2' }));

            const result = await makeClient(mockFetch).startUninstallation(VALIDATE_REQUEST);

            expect(result).toEqual({ message: 'queued', id: 'u-2' });
            expect(mockFetch).toHaveBeenCalledWith(
                `${BASE_URL}/installation/uninstallation`,
                expect.objectContaining({
                    method: 'POST',
                    headers: EXPECTED_POST_HEADERS,
                    body: JSON.stringify(VALIDATE_REQUEST),
                })
            );
        });

        it('surfaces a 409 no-op with its parsed reason (nothing installed)', async () => {
            mockFetch.mockResolvedValue(
                jsonResponse(409, { reason: 'not-installed', message: 'Nothing installed.' })
            );

            try {
                await makeClient(mockFetch).startUninstallation(VALIDATE_REQUEST);
                throw new Error('expected a rejection');
            } catch (error) {
                const apiError = error as AppManagementApiError;
                expect(apiError.status).toBe(409);
                expect(apiError.reason).toBe('not-installed');
            }
        });

        it('DELETEs the uninstallation record and the association (no body)', async () => {
            mockFetch.mockResolvedValue(jsonResponse(204, undefined));
            const client = makeClient(mockFetch);

            await client.clearUninstallationState();
            await client.clearAssociation();

            expect(mockFetch).toHaveBeenNthCalledWith(
                1,
                `${BASE_URL}/installation/uninstallation`,
                expect.objectContaining({
                    method: 'DELETE',
                    headers: EXPECTED_GET_HEADERS,
                    body: undefined,
                })
            );
            expect(mockFetch).toHaveBeenNthCalledWith(
                2,
                `${BASE_URL}/association`,
                expect.objectContaining({ method: 'DELETE' })
            );
        });

        it('a non-2xx clear throws the sanitized typed error', async () => {
            mockFetch.mockResolvedValue(jsonResponse(500, { message: 'boom' }));

            await expect(makeClient(mockFetch).clearAssociation()).rejects.toThrow(
                'Clear association failed (HTTP 500)'
            );
        });

        // The uninstallation record's own clear has its own label, so a failure
        // says WHICH delete failed rather than borrowing the association's.
        it('a non-2xx clear of the uninstallation record throws under its own label', async () => {
            mockFetch.mockResolvedValue(jsonResponse(502, { message: 'boom' }));

            const failure = makeClient(mockFetch).clearUninstallationState();

            await expect(failure).rejects.toThrow(AppManagementApiError);
            await expect(failure).rejects.toThrow(
                'Clear uninstallation state failed (HTTP 502)'
            );
        });

        it('never reads the body of the uninstallation state 204', async () => {
            const response = noContentResponse();
            mockFetch.mockResolvedValue(response);

            await expect(makeClient(mockFetch).getUninstallationState()).resolves.toBeUndefined();
            expect(response.json).not.toHaveBeenCalled();
        });
    });

    /**
     * What a 409 body is allowed to carry OUT of this module, and what every
     * other status is not.
     *
     * The LIVE API answers no-op 409s with a message and NO `reason` field
     * ("Installation has already completed successfully.", measured 2026-08-27),
     * so the message is the only thing that classifies them — which is why it is
     * kept, bounded, and kept for the 409 alone.
     */
    describe('409 no-op bodies', () => {
        it('keeps a 409 body message, bounded to 200 characters', async () => {
            const long = `x`.repeat(500);
            mockFetch.mockResolvedValue(jsonResponse(409, { message: long }));

            const failure = makeClient(mockFetch).reconcileInstallation(RECONCILE_REQUEST);

            await expect(failure).rejects.toMatchObject({
                status: 409,
                reason: undefined,
                noOpMessage: 'x'.repeat(200),
            });
        });

        it('reports a 409 reason with no message as a reason and nothing else', async () => {
            mockFetch.mockResolvedValue(jsonResponse(409, { reason: 'not-associated' }));

            await expect(
                makeClient(mockFetch).reconcileInstallation(RECONCILE_REQUEST)
            ).rejects.toMatchObject({
                status: 409,
                reason: 'not-associated',
                noOpMessage: undefined,
            });
        });

        /**
         * `noOpMessage` is typed `string | undefined` and is read as text by the
         * callers that classify a no-op. A 409 body whose `message` is an array
         * or an object must be dropped, not passed through — the type guard is
         * the only thing standing between a body and the error object.
         */
        it('drops a 409 message that is not a string', async () => {
            mockFetch.mockResolvedValue(
                jsonResponse(409, { reason: 'not-installed', message: ['a', 'b', 'c'] })
            );

            await expect(
                makeClient(mockFetch).reconcileInstallation(RECONCILE_REQUEST)
            ).rejects.toMatchObject({
                status: 409,
                reason: 'not-installed',
                noOpMessage: undefined,
            });
        });

        it('reports a 409 with no JSON body at all as a bare 409', async () => {
            mockFetch.mockResolvedValue(nonJsonResponse(409));

            await expect(
                makeClient(mockFetch).reconcileInstallation(RECONCILE_REQUEST)
            ).rejects.toMatchObject({
                status: 409,
                reason: undefined,
                noOpMessage: undefined,
            });
        });

        /**
         * The 409 is the ONLY status whose body is retained. Any other failure
         * carries an upstream body that may name internal hosts or ids, and this
         * error object is what reaches logs and tickets.
         */
        it('keeps nothing from the body of a non-409 failure', async () => {
            mockFetch.mockResolvedValue(
                jsonResponse(400, { message: 'internal detail', reason: 'already-current' })
            );

            const failure = makeClient(mockFetch).reconcileInstallation(RECONCILE_REQUEST);

            await expect(failure).rejects.toMatchObject({
                status: 400,
                reason: undefined,
                noOpMessage: undefined,
            });
        });
    });

    describe('sanitization', () => {
        it('never leaks the access token into error messages', async () => {
            mockFetch.mockResolvedValue(jsonResponse(500, { message: 'boom' }));

            try {
                await makeClient(mockFetch).getInstallationState();
                throw new Error('expected a rejection');
            } catch (error) {
                expect((error as Error).message).not.toContain(FAKE_TOKEN);
                expect((error as Error).message).toBe('Get installation state failed (HTTP 500)');
            }
        });

        it('reports a non-JSON 200 as a typed, sanitized error', async () => {
            mockFetch.mockResolvedValue(nonJsonResponse(200));

            await expect(makeClient(mockFetch).getInstallationState()).rejects.toThrow(
                'Get installation state returned an unexpected non-JSON response (HTTP 200)'
            );
        });
    });
});
