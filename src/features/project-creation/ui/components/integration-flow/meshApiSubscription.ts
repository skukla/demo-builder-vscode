/**
 * meshApiSubscription — the shared contract for the `ensure-mesh-api-subscribed`
 * handler result.
 *
 * The mesh enable runs once, inside the Add Integration modal (which commits a
 * mesh only on a SUCCESSFUL enable) and is re-subscribed idempotently at deploy.
 * These types are the result shape that flow (and the project-creation phases)
 * consumes. Type-only module — no React, no runtime.
 *
 * @module features/project-creation/ui/components/integration-flow/meshApiSubscription
 */

/** A subscribed API as reported by the `ensure-mesh-api-subscribed` handler. */
export interface SubscribedApi {
    code: string;
    name?: string;
}

/**
 * Result shape returned by the `ensure-mesh-api-subscribed` handler. The enable is
 * run and consumed by the Add modal / creation flow.
 */
export interface EnsureResult {
    success: boolean;
    error?: string;
    code?: string;
    /** On success: the resolved+subscribed APIs. */
    data?: { apis: SubscribedApi[] };
}
