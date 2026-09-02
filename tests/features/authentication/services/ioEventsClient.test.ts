/**
 * I/O Events Management API Client Tests
 *
 * Verifies the pure-fetch client for api.adobe.io/events:
 * - Exact header assembly (Bearer + x-api-key + Accept: application/hal+json)
 * - listProviders HAL parsing + defensive `_links.next` pagination with a hard cap
 * - listRegistrations id normalization (registration_id ?? id) and 404 → []
 * - DELETE semantics: 2xx/404 resolve, other statuses throw typed errors
 * - parseProviderBinding href parsing (absolute/relative/query, malformed → undefined)
 * - Sanitized errors: the access token never leaks into thrown messages
 *
 * All auth values are obviously fake — this repo is public.
 */

import {
    IoEventsClient,
    MAX_PROVIDER_PAGES,
    THIRD_PARTY_PROVIDER_METADATA,
    isEventsAccessDenied,
    parseProviderBinding,
    type EventsAuth,
} from '@/features/authentication/services/ioEventsClient';
import { jsonResponse } from './ioEventsClient.testUtils';

const FAKE_TOKEN = 'fake-test-token-not-a-secret';
const FAKE_API_KEY = 'fake-test-client-id-not-a-secret';

const AUTH: EventsAuth = { accessToken: FAKE_TOKEN, apiKey: FAKE_API_KEY };

const EXPECTED_HEADERS = {
    Authorization: `Bearer ${FAKE_TOKEN}`,
    'x-api-key': FAKE_API_KEY,
    Accept: 'application/hal+json',
};

/** Build a stub fetch Response with a JSON body. */

/** Build a stub fetch Response whose body is not valid JSON. */
function nonJsonResponse(status: number): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: 'Stub',
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON')),
    } as unknown as Response;
}

function makeClient(mockFetch: jest.Mock): IoEventsClient {
    return new IoEventsClient(AUTH, mockFetch as unknown as typeof fetch);
}

describe('ioEventsClient', () => {
    let mockFetch: jest.Mock;

    beforeEach(() => {
        mockFetch = jest.fn();
    });

    describe('THIRD_PARTY_PROVIDER_METADATA', () => {
        it('matches the custom-events provider_metadata discriminator', () => {
            expect(THIRD_PARTY_PROVIDER_METADATA).toBe('3rd_party_custom_events');
        });
    });

    describe('listProviders', () => {
        it('GETs /events/{orgId}/providers with exact headers', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(200, { _embedded: { providers: [] } }));

            await makeClient(mockFetch).listProviders('org-1');

            expect(mockFetch).toHaveBeenCalledTimes(1);
            const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            expect(url).toBe('https://api.adobe.io/events/org-1/providers');
            expect(init.method).toBe('GET');
            expect(init.headers).toEqual(EXPECTED_HEADERS);
        });

        it('returns raw entries from _embedded.providers', async () => {
            const providers = [
                { id: 'prov-a', label: 'A', provider_metadata: THIRD_PARTY_PROVIDER_METADATA },
                { id: 'prov-b', label: 'B', provider_metadata: 'dx_commerce_events' },
            ];
            mockFetch.mockResolvedValueOnce(jsonResponse(200, { _embedded: { providers } }));

            const result = await makeClient(mockFetch).listProviders('org-1');

            expect(result).toEqual(providers);
        });

        it('returns [] when _embedded is missing', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));

            await expect(makeClient(mockFetch).listProviders('org-1')).resolves.toEqual([]);
        });

        it('returns [] when _embedded.providers is empty', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(200, { _embedded: { providers: [] } }));

            await expect(makeClient(mockFetch).listProviders('org-1')).resolves.toEqual([]);
        });

        it('follows an absolute _links.next.href then terminates', async () => {
            mockFetch
                .mockResolvedValueOnce(jsonResponse(200, {
                    _embedded: { providers: [{ id: 'prov-1' }] },
                    _links: { next: { href: 'https://api.adobe.io/events/org-1/providers?page=1' } },
                }))
                .mockResolvedValueOnce(jsonResponse(200, {
                    _embedded: { providers: [{ id: 'prov-2' }] },
                }));

            const result = await makeClient(mockFetch).listProviders('org-1');

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(mockFetch.mock.calls[1][0]).toBe('https://api.adobe.io/events/org-1/providers?page=1');
            expect(result.map(p => p.id)).toEqual(['prov-1', 'prov-2']);
        });

        it('resolves a relative _links.next.href against api.adobe.io', async () => {
            mockFetch
                .mockResolvedValueOnce(jsonResponse(200, {
                    _embedded: { providers: [{ id: 'prov-1' }] },
                    _links: { next: { href: '/events/org-1/providers?page=1' } },
                }))
                .mockResolvedValueOnce(jsonResponse(200, {
                    _embedded: { providers: [{ id: 'prov-2' }] },
                }));

            const result = await makeClient(mockFetch).listProviders('org-1');

            expect(mockFetch.mock.calls[1][0]).toBe('https://api.adobe.io/events/org-1/providers?page=1');
            expect(result).toHaveLength(2);
        });

        it('does NOT follow a _links.next.href pointing at a foreign host (stops, no request)', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(200, {
                _embedded: { providers: [{ id: 'prov-1' }] },
                _links: { next: { href: 'https://evil.example.com/events/org-1/providers?page=1' } },
            }));

            const result = await makeClient(mockFetch).listProviders('org-1');

            // Pagination treats the foreign link as the end of the list —
            // the auth headers are never sent off api.adobe.io.
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(result.map(p => p.id)).toEqual(['prov-1']);
        });

        it('stops at the hard iteration cap when next links never end', async () => {
            mockFetch.mockResolvedValue(jsonResponse(200, {
                _embedded: { providers: [{ id: 'prov-loop' }] },
                _links: { next: { href: '/events/org-1/providers?page=forever' } },
            }));

            const result = await makeClient(mockFetch).listProviders('org-1');

            expect(mockFetch).toHaveBeenCalledTimes(MAX_PROVIDER_PAGES);
            expect(result).toHaveLength(MAX_PROVIDER_PAGES);
        });

        it('throws a typed error carrying the status on non-2xx', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(500, {}));

            await expect(makeClient(mockFetch).listProviders('org-1')).rejects.toMatchObject({
                status: 500,
            });
        });

        it('never includes the access token in a thrown error', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(500, {}));

            let caught: unknown;
            try {
                await makeClient(mockFetch).listProviders('org-1');
            } catch (error) {
                caught = error;
            }
            expect(caught).toBeDefined();
            expect(String(caught)).not.toContain(FAKE_TOKEN);
            expect((caught as Error).message).not.toContain(FAKE_TOKEN);
        });

        it('throws a sanitized typed error when the body is not JSON', async () => {
            mockFetch.mockResolvedValueOnce(nonJsonResponse(200));

            let caught: unknown;
            try {
                await makeClient(mockFetch).listProviders('org-1');
            } catch (error) {
                caught = error;
            }
            expect(caught).toBeDefined();
            expect((caught as { status?: number }).status).toBe(200);
            expect(String(caught)).not.toContain(FAKE_TOKEN);
        });
    });

    describe('listRegistrations', () => {
        it('GETs /events/{orgId}/{projectId}/{workspaceId}/registrations with exact headers', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(200, { _embedded: { registrations: [] } }));

            await makeClient(mockFetch).listRegistrations('org-1', 'proj-1', 'ws-1');

            const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            expect(url).toBe('https://api.adobe.io/events/org-1/proj-1/ws-1/registrations');
            expect(init.method).toBe('GET');
            expect(init.headers).toEqual(EXPECTED_HEADERS);
        });

        it('parses entries carrying registration_id', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(200, {
                _embedded: { registrations: [{ registration_id: 'reg-1', name: 'My Registration' }] },
            }));

            const result = await makeClient(mockFetch).listRegistrations('org-1', 'proj-1', 'ws-1');

            expect(result).toEqual([{ id: 'reg-1', name: 'My Registration' }]);
        });

        it('falls back to the id field when registration_id is absent', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(200, {
                _embedded: { registrations: [{ id: 'reg-2' }] },
            }));

            const result = await makeClient(mockFetch).listRegistrations('org-1', 'proj-1', 'ws-1');

            expect(result).toEqual([{ id: 'reg-2', name: undefined }]);
        });

        it('skips entries with neither registration_id nor id', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(200, {
                _embedded: { registrations: [{ name: 'orphan' }, { id: 'reg-3' }] },
            }));

            const result = await makeClient(mockFetch).listRegistrations('org-1', 'proj-1', 'ws-1');

            expect(result).toEqual([{ id: 'reg-3', name: undefined }]);
        });

        it('returns [] when the list endpoint 404s', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(404, {}));

            await expect(
                makeClient(mockFetch).listRegistrations('org-1', 'proj-1', 'ws-1'),
            ).resolves.toEqual([]);
        });

        it('returns [] when _embedded is missing', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));

            await expect(
                makeClient(mockFetch).listRegistrations('org-1', 'proj-1', 'ws-1'),
            ).resolves.toEqual([]);
        });

        it('throws a typed error carrying the status on other failures', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(500, {}));

            await expect(
                makeClient(mockFetch).listRegistrations('org-1', 'proj-1', 'ws-1'),
            ).rejects.toMatchObject({ status: 500 });
        });
    });

    describe('deleteRegistration', () => {
        it('DELETEs /events/{orgId}/{projectId}/{workspaceId}/registrations/{id} with exact headers', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(204, {}));

            await makeClient(mockFetch).deleteRegistration('org-1', 'proj-1', 'ws-1', 'reg-1');

            const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            expect(url).toBe('https://api.adobe.io/events/org-1/proj-1/ws-1/registrations/reg-1');
            expect(init.method).toBe('DELETE');
            expect(init.headers).toEqual(EXPECTED_HEADERS);
        });

        it('resolves on 2xx', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(204, {}));

            await expect(
                makeClient(mockFetch).deleteRegistration('org-1', 'proj-1', 'ws-1', 'reg-1'),
            ).resolves.toBeUndefined();
        });

        it('resolves on 404 (already gone)', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(404, {}));

            await expect(
                makeClient(mockFetch).deleteRegistration('org-1', 'proj-1', 'ws-1', 'reg-1'),
            ).resolves.toBeUndefined();
        });

        it('throws on 403 and isEventsAccessDenied() recognizes it', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(403, {}));

            let caught: unknown;
            try {
                await makeClient(mockFetch).deleteRegistration('org-1', 'proj-1', 'ws-1', 'reg-1');
            } catch (error) {
                caught = error;
            }
            expect(caught).toBeDefined();
            expect(isEventsAccessDenied(caught)).toBe(true);
        });

        it('throws on 500 and isEventsAccessDenied() rejects it', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(500, {}));

            let caught: unknown;
            try {
                await makeClient(mockFetch).deleteRegistration('org-1', 'proj-1', 'ws-1', 'reg-1');
            } catch (error) {
                caught = error;
            }
            expect(caught).toBeDefined();
            expect((caught as { status?: number }).status).toBe(500);
            expect(isEventsAccessDenied(caught)).toBe(false);
        });
    });

    describe('deleteProvider', () => {
        it('DELETEs /events/{orgId}/{projectId}/{workspaceId}/providers/{id} with exact headers', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));

            await makeClient(mockFetch).deleteProvider('org-1', 'proj-1', 'ws-1', 'prov-1');

            const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            expect(url).toBe('https://api.adobe.io/events/org-1/proj-1/ws-1/providers/prov-1');
            expect(init.method).toBe('DELETE');
            expect(init.headers).toEqual(EXPECTED_HEADERS);
        });

        it('resolves on 2xx', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(204, {}));

            await expect(
                makeClient(mockFetch).deleteProvider('org-1', 'proj-1', 'ws-1', 'prov-1'),
            ).resolves.toBeUndefined();
        });

        it('resolves on 404 (already gone)', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(404, {}));

            await expect(
                makeClient(mockFetch).deleteProvider('org-1', 'proj-1', 'ws-1', 'prov-1'),
            ).resolves.toBeUndefined();
        });

        it('throws on 401 and isEventsAccessDenied() recognizes it', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(401, {}));

            let caught: unknown;
            try {
                await makeClient(mockFetch).deleteProvider('org-1', 'proj-1', 'ws-1', 'prov-1');
            } catch (error) {
                caught = error;
            }
            expect(caught).toBeDefined();
            expect(isEventsAccessDenied(caught)).toBe(true);
        });

        it('never includes the access token in a thrown error', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(500, {}));

            let caught: unknown;
            try {
                await makeClient(mockFetch).deleteProvider('org-1', 'proj-1', 'ws-1', 'prov-1');
            } catch (error) {
                caught = error;
            }
            expect(caught).toBeDefined();
            expect(String(caught)).not.toContain(FAKE_TOKEN);
            expect((caught as Error).message).not.toContain(FAKE_TOKEN);
        });
    });

    describe('parseProviderBinding', () => {
        it('parses an absolute rel:update href', () => {
            const binding = parseProviderBinding(
                'https://api.adobe.io/events/org-1/proj-1/ws-1/providers/prov-1',
            );

            expect(binding).toEqual({
                providerId: 'prov-1',
                projectId: 'proj-1',
                workspaceId: 'ws-1',
            });
        });

        it('parses a relative rel:update href', () => {
            const binding = parseProviderBinding('/events/org-1/proj-1/ws-1/providers/prov-1');

            expect(binding).toEqual({
                providerId: 'prov-1',
                projectId: 'proj-1',
                workspaceId: 'ws-1',
            });
        });

        it('tolerates a query-string suffix', () => {
            const binding = parseProviderBinding(
                '/events/org-1/proj-1/ws-1/providers/prov-1?eventmetadata=true',
            );

            expect(binding).toEqual({
                providerId: 'prov-1',
                projectId: 'proj-1',
                workspaceId: 'ws-1',
            });
        });

        it('returns undefined for a wrong path shape (missing workspace segment)', () => {
            expect(parseProviderBinding('/events/org-1/proj-1/providers/prov-1')).toBeUndefined();
        });

        it('returns undefined for a path with trailing extra segments', () => {
            expect(
                parseProviderBinding('/events/org-1/proj-1/ws-1/providers/prov-1/extra'),
            ).toBeUndefined();
        });

        it('returns undefined for an empty or missing href', () => {
            expect(parseProviderBinding('')).toBeUndefined();
            expect(parseProviderBinding(undefined as unknown as string)).toBeUndefined();
        });

        it('returns undefined for an unrelated URL', () => {
            expect(
                parseProviderBinding('https://api.adobe.io/console/organizations/org-1'),
            ).toBeUndefined();
        });

        it('returns undefined when any segment is a traversal-shaped ".." (never deleted)', () => {
            expect(parseProviderBinding('/events/org-1/../ws-1/providers/prov-1')).toBeUndefined();
            expect(parseProviderBinding('/events/org-1/proj-1/../providers/prov-1')).toBeUndefined();
            expect(parseProviderBinding('/events/org-1/proj-1/ws-1/providers/..')).toBeUndefined();
        });

        it('still parses UUID-shaped provider ids', () => {
            const binding = parseProviderBinding(
                '/events/org-1/proj-1/ws-1/providers/8a4f6a2e-1b3c-4d5e-9f0a-b1c2d3e4f5a6',
            );

            expect(binding?.providerId).toBe('8a4f6a2e-1b3c-4d5e-9f0a-b1c2d3e4f5a6');
        });
    });

    describe('isEventsAccessDenied', () => {
        it('returns false for a plain Error', () => {
            expect(isEventsAccessDenied(new Error('403'))).toBe(false);
        });

        it('returns false for non-error values', () => {
            expect(isEventsAccessDenied(undefined)).toBe(false);
            expect(isEventsAccessDenied('403')).toBe(false);
            expect(isEventsAccessDenied({ status: 403 })).toBe(false);
        });
    });
});
