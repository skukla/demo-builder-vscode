/**
 * Shared setup for the `executorMeshPhase` suites.
 *
 * The family became a split family on 2026-09-07, when two suites were renamed
 * out of `executor-*` to sit against the module that DEFINES their subjects
 * (`executorMeshPhase.ts`) rather than the one that re-exports them. A split
 * family needs a shared setup — `tests/sop/test-family-setup.test.ts` enforces
 * that, and it is what caught the rename. Two more joined the same day
 * (`-executePhase`, `-componentConfigs`), which is why all four SUT exports are
 * listed below.
 *
 * This file owns the SUT import deliberately. Mocks declared in a spec hoist
 * above that spec's own imports, so a spec that imports the subject itself can
 * bind to the real module before its `jest.mock` calls are registered; reaching
 * the subject through here keeps that ordering safe for both suites, and for any
 * third that joins them.
 *
 * The two fakes below are re-exported rather than re-created: they are the house
 * builders, and `tests/sop/canonical-fakes.test.ts` refuses a hand-rolled
 * substitute.
 */

export {
    ensureMeshPreflightAuth,
    deployFreshMesh,
    executeMeshPhase,
    populateMeshComponentConfigs,
} from '@/features/project-creation/handlers/executorMeshPhase';

export { createMockLogger } from '../../../helpers/loggerFake';
export { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
