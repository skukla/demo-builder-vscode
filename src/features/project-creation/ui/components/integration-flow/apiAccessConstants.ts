/**
 * Shared API-access constants for the integration flow (pure — no React/Spectrum,
 * so pure logic like {@link enabledApisFromSelection} can import them without
 * dragging in the component tree).
 *
 * @module features/project-creation/ui/components/integration-flow/apiAccessConstants
 */

/** The baseline Adobe I/O API every App Builder integration subscribes at deploy. */
export const BASELINE_CODE = 'AdobeIOManagementAPISDK';
