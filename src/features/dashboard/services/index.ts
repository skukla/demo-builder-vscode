/**
 * Dashboard Services
 *
 * Business logic for dashboard operations.
 * Extracted from handlers for proper service layer separation.
 */

export {
    buildStatusPayload,
    hasMeshDeploymentRecord,
    getMeshEndpointFromConfigs,
    type MeshStatusInfo,
    type StatusPayload,
} from './dashboardStatusService';
