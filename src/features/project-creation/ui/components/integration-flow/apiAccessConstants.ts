/**
 * Shared API-access constants for the integration flow (pure — no React/Spectrum,
 * so pure logic can import them without dragging in the component tree).
 *
 * Once also held `API_LABELS` / `apiLabel`, friendly display names for sdk codes.
 * Their only consumer was the retired center-column row's expandable "APIs in
 * use" list; the shared card shows a COUNT and the names live in the picker,
 * which renders them from the org's own API list rather than from a local map.
 * Deleted with the row rather than left as an unused export.
 *
 * @module features/project-creation/ui/components/integration-flow/apiAccessConstants
 */

/** The baseline Adobe I/O API every App Builder integration subscribes at deploy. */
export const BASELINE_CODE = 'AdobeIOManagementAPISDK';
