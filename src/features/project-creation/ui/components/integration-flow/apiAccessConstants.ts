/**
 * Shared API-access constants for the integration flow (pure — no React/Spectrum,
 * so pure logic like {@link enabledApisFromSelection} can import them without
 * dragging in the component tree).
 *
 * @module features/project-creation/ui/components/integration-flow/apiAccessConstants
 */

/** The baseline Adobe I/O API every App Builder integration subscribes at deploy. */
export const BASELINE_CODE = 'AdobeIOManagementAPISDK';

/**
 * Short, stable display names for the APIs we surface (the informational stage's
 * required/baseline codes, plus the baseline shown on the result row). The org
 * list's real names are verbose ("API Mesh for Adobe Developer App Builder"); these
 * are the friendly, instant labels. A code with no entry falls back to itself —
 * still readable, and picks come back with their sdk code as secondary text anyway.
 */
export const API_LABELS: Record<string, string> = {
    GraphQLServiceSDK: 'API Mesh',
    [BASELINE_CODE]: 'I/O Management API',
};

/** Friendly label for an sdk code, falling back to the code itself. */
export function apiLabel(code: string): string {
    return API_LABELS[code] ?? code;
}
