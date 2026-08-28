/**
 * On-open check orchestrator — public API.
 *
 * @module features/dashboard/services/onOpenChecks
 */

export { runOnOpenChecks, armOnOpenChecks, _resetOnOpenChecksGuardForTests } from './orchestrator';
export { createOrgContextCheck, type OrgContextCheckData } from './orgContextCheck';
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
export {
    createAiContextFreshnessCheck,
    type AiContextFreshnessCheckDeps,
} from './aiContextFreshnessCheck';
export type {
    CheckStatus,
    CheckOutcome,
    CheckResult,
    OnOpenCheck,
    OnOpenCheckContext,
    RunOnOpenChecksDeps,
} from './types';
