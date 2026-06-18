/**
 * B2B readiness detection.
 *
 * Adobe Commerce B2B features (company, quotes, purchase orders, requisition
 * lists) are a **backend prerequisite** — there is no public API to enable them
 * (Admin/CLI on PaaS; provisioned on SaaS/ACCS). The builder therefore can't
 * turn B2B on, but it CAN read-only *detect* whether a connected backend already
 * has it, via the Commerce GraphQL `storeConfig` query, and warn when a B2B-code
 * package (e.g. `b2b`, `citisignal-b2b`) is pointed at a non-B2B backend — so the
 * user isn't surprised by an account page with no B2B features.
 *
 * Reliability contract — **true-negative-only**: return `'disabled'` ONLY on a
 * definitive `is_requisition_list_active: false`. Anything uncertain (field
 * absent on an older/SaaS schema, GraphQL errors, non-OK HTTP, network failure)
 * is `'unknown'` and callers stay silent. Detection can never false-alarm and
 * never throws into the create/reset flow.
 *
 * The query is storefront-scoped and anonymous (no Authorization header).
 *
 * @module features/eds/services/b2bReadinessDetection
 */

export type B2bReadiness = 'enabled' | 'disabled' | 'unknown';

const STORE_CONFIG_B2B_QUERY = '{ storeConfig { is_requisition_list_active } }';

/**
 * Probe a Commerce GraphQL endpoint for B2B enablement.
 *
 * @param graphqlEndpoint - The Commerce GraphQL endpoint (core or mesh).
 * @param fetchImpl - Injected fetch (defaults to global), for testability.
 * @returns `'enabled' | 'disabled' | 'unknown'` — see the reliability contract.
 */
export async function detectB2bReadiness(
    graphqlEndpoint: string,
    fetchImpl: typeof fetch = fetch,
): Promise<B2bReadiness> {
    try {
        const response = await fetchImpl(graphqlEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: STORE_CONFIG_B2B_QUERY }),
        });

        if (!response.ok) return 'unknown';

        const payload = (await response.json()) as {
            data?: { storeConfig?: { is_requisition_list_active?: unknown } };
            errors?: unknown[];
        };

        if (payload.errors && payload.errors.length > 0) return 'unknown';

        const flag = payload.data?.storeConfig?.is_requisition_list_active;
        if (flag === true) return 'enabled';
        if (flag === false) return 'disabled';
        return 'unknown';
    } catch {
        // Network/parse failure — never throw into create/reset; degrade silently.
        return 'unknown';
    }
}
