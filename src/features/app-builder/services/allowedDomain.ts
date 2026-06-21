/**
 * Allowed-domain derivation for the API Mesh apiKey credential (Step 07).
 *
 * The Console API-Mesh credential's `domain` field is mandatory
 * (`domainMandatory:true`). Per the D1 spike (Q5 DEFINITIVE) and the shipped
 * `setupInstructions.ts`, the value is the selected frontend's `localhost:<port>`
 * (default `localhost:3000`) — a formality satisfying the required field, NOT
 * the hardcoded `example.com` the spike first used.
 */

import type { Project } from '@/types/base';

const DEFAULT_PORT = 3000;

/**
 * Derive the allowed `domain` for the API Mesh apiKey credential from the
 * project's selected frontend: `localhost:<port>`, defaulting to
 * `localhost:3000` when no frontend/port is known.
 */
export function deriveAllowedDomain(project: Project): string {
    const frontendId = project.componentSelections?.frontend;
    const port = frontendId
        ? project.componentInstances?.[frontendId]?.port ?? DEFAULT_PORT
        : DEFAULT_PORT;
    return `localhost:${port}`;
}
