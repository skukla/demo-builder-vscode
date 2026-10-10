/**
 * I/O Events Management API client (pure fetch, no SDK dependency).
 *
 * Minimal client for the subset of api.adobe.io/events endpoints the
 * console-project teardown flow needs: list org providers, list/delete
 * workspace event registrations, delete providers. Endpoint shapes were
 * spike-validated (see .rptc/research/delete-aio-project/research.md).
 *
 * This file names the endpoints and normalizes their answers. How a request
 * travels (headers, timeout, sanitized errors, already-gone DELETEs, the
 * pagination host check) is `ioEventsTransport.ts`; which providers belong to
 * a project is `eventProviderBinding.ts` (both split 2026-10-08).
 */

import {
    IO_EVENTS_BASE_URL,
    IoEventsTransport,
    resolveNextPageUrl,
    type EventsAuth,
    type RawProvider,
} from './ioEventsTransport';

/**
 * Hard cap on `_links.next` pagination hops in {@link IoEventsClient.listProviders}.
 * Guarantees termination even if the API returns a cyclic/never-ending next link.
 * Spike data: ~1,600 providers org-wide; page size 10+ → 200 pages is generous.
 */
export const MAX_PROVIDER_PAGES = 200;

/** Event registration entry, normalized to a stable `id`. */
export interface EventRegistrationSummary {
    id: string;
    name?: string;
}

/** Body for POST …/providers (research §3.1; matches @adobe/aio-lib-events). */
export interface CreateProviderBody {
    label: string;
    description?: string;
    docs_url?: string;
    /** Deterministic instance id — the find-before-create key (kit model). */
    instance_id?: string;
    provider_metadata?: string;
    data_residency_region?: string;
}

/** Body for POST …/providers/{id}/eventmetadata. */
export interface CreateEventMetadataBody {
    event_code: string;
    label: string;
    description: string;
    /** Base64-encoded JSON sample payload. */
    sample_event_template?: string;
}

/** Body for POST …/registrations. */
export interface CreateRegistrationBody {
    /** The workspace S2S credential's client_id — also sent as x-api-key. */
    client_id: string;
    name: string;
    description: string;
    delivery_type: 'webhook' | 'webhook_batch' | 'journal';
    webhook_url?: string;
    events_of_interest: Array<{ provider_id: string; event_code: string }>;
    enabled?: boolean;
}

/**
 * I/O Events Management API client.
 *
 * Every call travels through {@link IoEventsTransport}: Bearer + `x-api-key` +
 * HAL `Accept`, and DELETEs treat 404 as already-gone success.
 */
export class IoEventsClient {
    private readonly transport: IoEventsTransport;

    /**
     * @param auth - IMS access token + S2S client_id
     * @param fetchImpl - Injectable fetch (tests); defaults to global fetch
     */
    constructor(auth: EventsAuth, fetchImpl?: typeof fetch) {
        this.transport = new IoEventsTransport(auth, fetchImpl);
    }

    /**
     * List ALL providers in the org (raw, unfiltered — filtering by
     * `provider_metadata` and binding is the caller's job). Follows
     * `_links.next` pagination defensively, capped at {@link MAX_PROVIDER_PAGES}.
     */
    async listProviders(orgId: string, opts?: { instanceId?: string }): Promise<RawProvider[]> {
        const providers: RawProvider[] = [];
        const query = opts?.instanceId ? `?instanceId=${encodeURIComponent(opts.instanceId)}` : '';
        let url: string | undefined = `${IO_EVENTS_BASE_URL}/${orgId}/providers${query}`;

        for (let page = 0; page < MAX_PROVIDER_PAGES && url; page++) {
            const body = await this.transport.getJson(url, 'List providers');
            providers.push(...(body._embedded?.providers ?? []));
            url = resolveNextPageUrl(body._links?.next?.href);
        }

        return providers;
    }

    /**
     * List event registrations in a workspace, normalized to
     * `{ id, name? }` (the API uses `registration_id` or `id` depending on
     * version). A 404 on the list means no registrations → empty array.
     */
    async listRegistrations(
        orgId: string,
        projectId: string,
        workspaceId: string,
    ): Promise<EventRegistrationSummary[]> {
        const url = `${IO_EVENTS_BASE_URL}/${orgId}/${projectId}/${workspaceId}/registrations`;
        const response = await this.transport.request('GET', url);
        if (response.status === 404) {
            return [];
        }
        const body = await this.transport.parseJson(response, 'List registrations');
        const entries = body._embedded?.registrations ?? [];
        return entries
            .filter((entry) => Boolean(entry.registration_id ?? entry.id))
            .map((entry) => ({
                id: (entry.registration_id ?? entry.id) as string,
                name: entry.name,
            }));
    }

    /** Delete one event registration. 404 (already gone) resolves. */
    async deleteRegistration(
        orgId: string,
        projectId: string,
        workspaceId: string,
        registrationId: string,
    ): Promise<void> {
        const url =
            `${IO_EVENTS_BASE_URL}/${orgId}/${projectId}/${workspaceId}` +
            `/registrations/${registrationId}`;
        await this.transport.delete(url, 'Delete registration');
    }

    /**
     * Create an event provider in a workspace (AB-6 — the create half; the
     * client was teardown-only until 2026-08-28). Find-before-create is the
     * CALLER's job via `listProviders(orgId, { instanceId })`.
     */
    async createProvider(
        orgId: string,
        projectId: string,
        workspaceId: string,
        body: CreateProviderBody,
    ): Promise<RawProvider> {
        const url = `${IO_EVENTS_BASE_URL}/${orgId}/${projectId}/${workspaceId}/providers`;
        return (await this.transport.postJson(url, body, 'Create provider')) as RawProvider;
    }

    /** Create event metadata (one event type) on a provider. */
    async createEventMetadata(
        orgId: string,
        projectId: string,
        workspaceId: string,
        providerId: string,
        body: CreateEventMetadataBody,
    ): Promise<void> {
        const url =
            `${IO_EVENTS_BASE_URL}/${orgId}/${projectId}/${workspaceId}` +
            `/providers/${providerId}/eventmetadata`;
        await this.transport.postJson(url, body, 'Create event metadata');
    }

    /** Create an event registration; returns the normalized `{ id, name? }`. */
    async createRegistration(
        orgId: string,
        projectId: string,
        workspaceId: string,
        body: CreateRegistrationBody,
    ): Promise<EventRegistrationSummary> {
        const url = `${IO_EVENTS_BASE_URL}/${orgId}/${projectId}/${workspaceId}/registrations`;
        const created = (await this.transport.postJson(url, body, 'Create registration')) as {
            registration_id?: string;
            id?: string;
            name?: string;
        };
        return {
            id: (created.registration_id ?? created.id) as string,
            name: created.name,
        };
    }

    /** Delete one event-metadata entry. 404 (already gone) resolves. */
    async deleteEventMetadata(
        orgId: string,
        projectId: string,
        workspaceId: string,
        providerId: string,
        eventCode: string,
    ): Promise<void> {
        const url =
            `${IO_EVENTS_BASE_URL}/${orgId}/${projectId}/${workspaceId}` +
            `/providers/${providerId}/eventmetadata/${eventCode}`;
        await this.transport.delete(url, 'Delete event metadata');
    }

    /** Delete one event provider. 404 (already gone) resolves. */
    async deleteProvider(
        orgId: string,
        projectId: string,
        workspaceId: string,
        providerId: string,
    ): Promise<void> {
        const url =
            `${IO_EVENTS_BASE_URL}/${orgId}/${projectId}/${workspaceId}` +
            `/providers/${providerId}`;
        await this.transport.delete(url, 'Delete provider');
    }
}
