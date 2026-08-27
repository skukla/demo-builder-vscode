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
