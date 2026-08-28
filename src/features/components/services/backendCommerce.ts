/**
 * backendCommerce — the registry's per-backend Commerce contract.
 *
 * WHICH env key holds a backend's Commerce base URL — and which App Management
 * flavor it is — is knowledge the component registry owns (`components.json`
 * declares each backend's env contract). The App Management installer used to
 * keep a private copy of both facts in code, which is the silent-rename
 * failure mode this project has been burned by before: rename a key in the
 * registry and the code keeps looking for the old one, finding nothing,
 * with no error pointing anywhere (owner audit, 2026-08-27).
 *
 * Static import of the bundled JSON, same as the catalog loader: the registry
 * is a build-time constant, and the alignment test
 * (`type-json-alignment-stacks-components`) guards the field names.
 *
 * @module features/components/services/backendCommerce
 */

import componentsConfig from '../config/components.json';

/** A backend's declared Commerce connection contract. */
export interface BackendCommerceContract {
    /** App Management flavor: PaaS instance or ACCS tenant. */
    flavor: 'paas' | 'saas';
    /** The componentConfigs key whose value carries the Commerce base URL. */
    baseUrlKey: string;
    /** Suffix to strip from that value to recover the base (e.g. '/graphql'). */
    baseUrlStripSuffix?: string;
}

interface BackendRow {
    configuration?: { commerce?: BackendCommerceContract };
}

/**
 * The registry's Commerce contract for one backend id, or undefined when the
 * backend declares none (a non-Commerce backend, or an unknown id).
 *
 * @param backendId - a `componentSelections.backend` id (e.g. 'adobe-commerce-paas')
 * @returns the declared contract, or undefined
 */
export function getBackendCommerceContract(
    backendId: string | undefined,
): BackendCommerceContract | undefined {
    if (!backendId) return undefined;
    const backends = (componentsConfig as { backends?: Record<string, BackendRow> }).backends;
    return backends?.[backendId]?.configuration?.commerce;
}
