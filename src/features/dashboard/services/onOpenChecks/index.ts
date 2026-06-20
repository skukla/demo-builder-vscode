/**
 * On-open check orchestrator — public API.
 *
 * @module features/dashboard/services/onOpenChecks
 */

export { runOnOpenChecks, _resetOnOpenChecksGuardForTests } from './orchestrator';
export type {
    CheckStatus,
    CheckOutcome,
    OnOpenCheck,
    OnOpenCheckContext,
    RunOnOpenChecksDeps,
} from './types';
