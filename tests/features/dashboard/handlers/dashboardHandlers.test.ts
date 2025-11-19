/**
 * Tests for dashboard handlers (Pattern B - request-response)
 *
 * This file contains ONLY shared test setup and infrastructure.
 * Individual handler tests are split into dedicated files:
 * - dashboardHandlers-requestStatus.test.ts
 * - dashboardHandlers-unknownDeployed.test.ts
 * - dashboardHandlers-deployMesh.test.ts
 * - dashboardHandlers-reAuthenticate.test.ts
 * - dashboardHandlers-openDevConsole.test.ts
 */

// Mock dependencies
jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/features/authentication');
jest.mock('@/core/di');
jest.mock('@/core/validation', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
    validateURL: jest.fn(),
}));
jest.mock('@/features/mesh/services/meshVerifier', () => ({
    verifyMeshDeployment: jest.fn().mockResolvedValue(undefined),
    syncMeshStatus: jest.fn().mockResolvedValue(undefined),
}));

describe('dashboardHandlers - Pattern B (request-response)', () => {
    it('should have handler tests in dedicated split files', () => {
        // This file now contains only shared mocks and setup.
        // All handler tests are in split files:
        // - dashboardHandlers-requestStatus.test.ts (6 tests)
        // - dashboardHandlers-unknownDeployed.test.ts (5 tests)
        // - dashboardHandlers-deployMesh.test.ts (2 tests)
        // - dashboardHandlers-reAuthenticate.test.ts (5 tests)
        // - dashboardHandlers-openDevConsole.test.ts (4 tests)
        expect(true).toBe(true);
    });
});
