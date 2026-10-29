/**
 * Shared setup for the destination-move suites: the runner's deploy and teardown
 * replaced by recorders, and the SUT re-exported from here so it binds to them
 * (jest hoists a mock above the imports of the file it is in, not across files).
 */

export const mockDeployAppBuilderComponent = jest.fn();
export const mockTeardownRemote = jest.fn();
jest.mock('@/features/app-builder/services/appBuilderRedeployRun', () => ({
    deployAppBuilderComponent: (...a: unknown[]) => mockDeployAppBuilderComponent(...a),
}));
jest.mock('@/features/app-builder/services/appBuilderComponentTeardown', () => ({
    ...jest.requireActual('@/features/app-builder/services/appBuilderComponentTeardown'),
    teardownRemote: (...a: unknown[]) => mockTeardownRemote(...a),
}));

export { moveAppBuilderComponentsToDestination } from '@/features/app-builder/services/appBuilderComponentMigration';
