/**
 * On-open check orchestrator — public API.
 *
 * @module features/dashboard/services/onOpenChecks
 */

export { runOnOpenChecks, _resetOnOpenChecksGuardForTests } from './orchestrator';
export { orgContextCheck, type OrgContextCheckData } from './orgContextCheck';
export {
    createMcpHealthCheck,
    type McpHealthCheckData,
    type McpHealthCheckDeps,
    type McpHealResult,
} from './mcpHealthCheck';
export {
    createMeshVerifyCheck,
    type MeshVerifyCheckData,
    type MeshVerifyCheckDeps,
    type MeshVerifyResultLike,
} from './meshVerifyCheck';
export {
    createAiVerifyCheck,
    type AiVerifyCheckData,
    type AiVerifyCheckDeps,
} from './aiVerifyCheck';
export type {
    CheckStatus,
    CheckOutcome,
    OnOpenCheck,
    OnOpenCheckContext,
    RunOnOpenChecksDeps,
} from './types';
