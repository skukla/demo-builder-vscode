/**
 * meshApiSubscription — the shared contract for the `ensure-mesh-api-subscribed`
 * handler result.
 *
 * The mesh enable runs at the build/deploy (`meshSetupService` /
 * `deployMeshHeadless`) and, for a brand-new project, in the project-creation
 * `enabling` phase — never in the Add Integration modal, which provisions nothing.
 * These types are the shared result shape those callers consume. Type-only module
 * — no React, no runtime.
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
 * run at the build/deploy and consumed by the project-creation phases.
 */
export interface EnsureResult {
    success: boolean;
    error?: string;
    code?: string;
    /** On success: the resolved+subscribed APIs. */
    data?: { apis: SubscribedApi[] };
}
