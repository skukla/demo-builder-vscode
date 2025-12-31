/**
 * Dashboard Services
 *
 * Business logic for dashboard operations.
 * Extracted from handlers for proper service layer separation.
 */

export {
    buildStatusPayload,
    hasMeshDeploymentRecord,
    getMeshEndpoint,
    type MeshStatusInfo,
    type StatusPayload,
} from './dashboardStatusService';
