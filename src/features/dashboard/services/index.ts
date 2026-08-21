/**
 * Dashboard Services
 *
 * Business logic for dashboard operations.
 * Extracted from handlers for proper service layer separation.
 */

// The payload/status types moved to @/types/webviewPayloads (the one home
// for wire shapes); import DashboardStatusUpdatePayload / MeshStatusInfo /
// MeshStatus from there.
export {
    buildStatusPayload,
    hasMeshDeploymentRecord,
    getMeshEndpoint,
} from './dashboardStatusService';
