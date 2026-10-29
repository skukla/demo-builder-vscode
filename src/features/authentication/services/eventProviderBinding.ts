/**
 * Which event providers belong to which Console project and workspace.
 *
 * Split out of `ioEventsClient.ts` (decompose-god-file, 2026-10-08): the client
 * lists and deletes providers; this is the ownership rule teardown and the
 * event-provider lifecycle apply before deleting one — the provider kind they
 * may consider, and the project/workspace a provider's `rel:update` href binds
 * it to. It changes when that rule changes, not when the API does.
 *
 * @module features/authentication/services/eventProviderBinding
 */

/**
 * `provider_metadata` value identifying custom (3rd-party) event providers —
 * the only kind that can exist under our Console projects, and therefore the
 * only kind teardown may consider for deletion.
 *
 * Revisited 2026-08-28 when the create path shipped (AB-6): the filter stayed
 * correct BY CONSTRUCTION, because the lifecycle service pinned
 * `provider_metadata: THIRD_PARTY_PROVIDER_METADATA` on every provider it made.
 *
 * That service was REMOVED from develop on 2026-09-09 (`4a3889049`) — the
 * surface it fed was incomplete, and the design question is [[AB-8]]. Nothing in
 * this repo creates a provider today, so the only providers teardown can meet
 * are app-onboarded ones, which carry this value as they always did. The filter
 * is unchanged and still right; only its second justification is gone. If
 * creation returns from `feature/event-providers`, the pinning comes back with
 * it and so does the paragraph above.
 */
export const THIRD_PARTY_PROVIDER_METADATA = '3rd_party_custom_events';

/**
 * Shape of the `rel:update` href on a provider:
 * `/events/{orgId}/{projectId}/{workspaceId}/providers/{providerId}`,
 * optionally absolute and optionally followed by a query string or fragment.
 *
 * Segments are restricted to the Adobe id charset (`[A-Za-z0-9_-]`, matching
 * the `@/core/validation` resource-id validators; UUID provider ids fit too),
 * so traversal-shaped segments like `..` never parse into a binding — the
 * parsed ids are later interpolated into DELETE URL paths.
 */
const PROVIDER_UPDATE_HREF_PATTERN =
    /\/events\/[A-Za-z0-9_-]+\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/providers\/([A-Za-z0-9_-]+)(?:[?#].*)?$/;

/** Project/workspace binding parsed from a provider's `rel:update` href. */
export interface ProviderBinding {
    providerId: string;
    projectId: string;
    workspaceId: string;
    label?: string;
}

/**
 * Parse the project/workspace binding out of a provider's `rel:update` href.
 *
 * Tolerates absolute or relative hrefs and query-string/fragment suffixes.
 * Returns `undefined` for any href that does not match the exact
 * `/events/{orgId}/{projectId}/{workspaceId}/providers/{providerId}` shape —
 * callers rely on this: a provider whose binding cannot be parsed must
 * NEVER be deleted.
 */
export function parseProviderBinding(updateHref: string): ProviderBinding | undefined {
    const match = PROVIDER_UPDATE_HREF_PATTERN.exec(updateHref);
    if (!match) {
        return undefined;
    }
    const [, projectId, workspaceId, providerId] = match;
    return { providerId, projectId, workspaceId };
}
