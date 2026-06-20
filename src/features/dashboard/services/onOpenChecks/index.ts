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
export type {
    CheckStatus,
    CheckOutcome,
    OnOpenCheck,
    OnOpenCheckContext,
    RunOnOpenChecksDeps,
} from './types';
