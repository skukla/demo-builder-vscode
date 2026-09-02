/**
 * I/O Events client — the CREATE half (AB-6).
 *
 * The client was deliberately list/delete-only (teardown-scoped) until
 * 2026-08-28; these tests pin the create path added for the event-provider
 * lifecycle. Endpoint shapes come from the research doc
 * (.rptc/research/event-provider-lifecycle/research.md §3.1 — ground truth is
 * the kit's own io-events lib, matching @adobe/aio-lib-events):
 *
 *   POST {org}/{proj}/{ws}/providers                       { label, instance_id?, … }
 *   POST {org}/{proj}/{ws}/providers/{id}/eventmetadata    { event_code, label, … }
 *   POST {org}/{proj}/{ws}/registrations                   { client_id, name, delivery_type, … }
 *   DELETE …/providers/{id}/eventmetadata/{eventCode}      (404 = already gone)
 *   GET {org}/providers?instanceId=…                       (find-before-create)
 *
 * All auth values are obviously fake — this repo is public.
 */

import { IoEventsClient, type EventsAuth } from '@/features/authentication/services/ioEventsClient';
import { jsonResponse } from './ioEventsClient.testUtils';

const FAKE_TOKEN = 'fake-test-token-not-a-secret';
const FAKE_API_KEY = 'fake-test-client-id-not-a-secret';
const AUTH: EventsAuth = { accessToken: FAKE_TOKEN, apiKey: FAKE_API_KEY };

function makeClient(mockFetch: jest.Mock): IoEventsClient {
    return new IoEventsClient(AUTH, mockFetch as unknown as typeof fetch);
}

describe('ioEventsClient — create path', () => {
    let mockFetch: jest.Mock;

    beforeEach(() => {
        mockFetch = jest.fn();
    });

    describe('createProvider', () => {
        it('POSTs the workspace providers URL with a JSON body and Content-Type', async () => {
            mockFetch.mockResolvedValueOnce(
                jsonResponse(201, { id: 'prov-1', label: 'ERP events' })
            );

            const created = await makeClient(mockFetch).createProvider('org-1', 'proj-1', 'ws-1', {
                label: 'ERP events',
                instance_id: 'demo-builder.bodea.ws-1.erp',
            });

            const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            expect(url).toBe('https://api.adobe.io/events/org-1/proj-1/ws-1/providers');
            expect(init.method).toBe('POST');
            expect((init.headers as Record<string, string>)['Content-Type']).toBe(
                'application/json'
            );
            expect((init.headers as Record<string, string>).Authorization).toBe(
                `Bearer ${FAKE_TOKEN}`
            );
            expect(JSON.parse(init.body as string)).toEqual({
                label: 'ERP events',
                instance_id: 'demo-builder.bodea.ws-1.erp',
            });
            expect(created).toEqual({ id: 'prov-1', label: 'ERP events' });
        });

        it('throws a sanitized typed error on non-2xx (no token in the message)', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(409, { reason: 'conflict' }));

            const act = makeClient(mockFetch).createProvider('org-1', 'proj-1', 'ws-1', {
                label: 'x',
            });

            await expect(act).rejects.toThrow(/Create provider failed \(HTTP 409\)/);
            await expect(
                makeClient(mockFetch)
                    .createProvider('o', 'p', 'w', { label: 'x' })
                    .catch((e) => e.message)
            ).resolves.not.toContain(FAKE_TOKEN);
        });
    });

    describe('createEventMetadata', () => {
        it('POSTs the provider eventmetadata URL with the event body', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(201, { event_code: 'com.erp.order' }));

            await makeClient(mockFetch).createEventMetadata('org-1', 'proj-1', 'ws-1', 'prov-1', {
                event_code: 'com.erp.order',
                label: 'Order event',
                description: 'ERP order intake',
            });

            const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            expect(url).toBe(
                'https://api.adobe.io/events/org-1/proj-1/ws-1/providers/prov-1/eventmetadata'
            );
            expect(init.method).toBe('POST');
            expect(JSON.parse(init.body as string).event_code).toBe('com.erp.order');
        });
    });

    describe('createRegistration', () => {
        it('POSTs the workspace registrations URL and normalizes the created id', async () => {
            mockFetch.mockResolvedValueOnce(
                jsonResponse(201, { registration_id: 'reg-9', name: 'erp-journal' })
            );

            const created = await makeClient(mockFetch).createRegistration(
                'org-1',
                'proj-1',
                'ws-1',
                {
                    client_id: FAKE_API_KEY,
                    name: 'erp-journal',
                    description: 'ERP order journal',
                    delivery_type: 'journal',
                    events_of_interest: [{ provider_id: 'prov-1', event_code: 'com.erp.order' }],
                }
            );

            const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            expect(url).toBe('https://api.adobe.io/events/org-1/proj-1/ws-1/registrations');
            expect(init.method).toBe('POST');
            expect(created).toEqual({ id: 'reg-9', name: 'erp-journal' });
        });

        it('normalizes a bare `id` response the same way listRegistrations does', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(201, { id: 'reg-2', name: 'n' }));

            const created = await makeClient(mockFetch).createRegistration('o', 'p', 'w', {
                client_id: FAKE_API_KEY,
                name: 'n',
                description: '',
                delivery_type: 'journal',
                events_of_interest: [],
            });

            expect(created.id).toBe('reg-2');
        });
    });

    describe('deleteEventMetadata', () => {
        it('DELETEs the eventmetadata URL; 404 (already gone) resolves', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse(404, {}));

            await expect(
                makeClient(mockFetch).deleteEventMetadata(
                    'org-1',
                    'proj-1',
                    'ws-1',
                    'prov-1',
                    'com.erp.order'
                )
            ).resolves.toBeUndefined();

            const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            expect(url).toBe(
                'https://api.adobe.io/events/org-1/proj-1/ws-1/providers/prov-1/eventmetadata/com.erp.order'
            );
            expect(init.method).toBe('DELETE');
        });
    });

    describe('listProviders with instanceId (find-before-create)', () => {
        it('appends the instanceId query so a deterministic provider can be found', async () => {
            mockFetch.mockResolvedValueOnce(
                jsonResponse(200, { _embedded: { providers: [{ id: 'prov-1' }] } })
            );

            const found = await makeClient(mockFetch).listProviders('org-1', {
                instanceId: 'demo-builder.bodea.ws-1.erp',
            });

            const [url] = mockFetch.mock.calls[0] as [string];
            expect(url).toBe(
                'https://api.adobe.io/events/org-1/providers?instanceId=demo-builder.bodea.ws-1.erp'
            );
            expect(found).toHaveLength(1);
        });
    });
});
