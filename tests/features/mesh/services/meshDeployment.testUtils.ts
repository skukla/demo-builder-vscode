import { promises as fsPromises } from 'fs';

/**
 * Shared test utilities for meshDeployment tests
 */

export const mockFs = fsPromises as jest.Mocked<typeof fsPromises>;

export function createMockCommandManager() {
    return {
        execute: jest.fn(),
    };
}

/** Canonical logger fake (ADR-016). Re-exported so existing imports keep working. */
export { createMockLogger } from '../../../helpers/loggerFake';

export function setupMeshDeploymentVerifierMock() {
    jest.mock('@/features/mesh/services/meshDeploymentVerifier', () => ({
        waitForMeshDeployment: jest.fn(),
    }));
}

export function getMeshDeploymentVerifier() {
    return require('@/features/mesh/services/meshDeploymentVerifier');
}

export function mockSuccessfulFileRead() {
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));
}

export function mockSuccessfulDeployment(mockCommandManager: any) {
    mockCommandManager.execute.mockResolvedValue({
        code: 0,
        stdout: 'Mesh updated successfully',
    });
}

export function mockSuccessfulVerification() {
    const { waitForMeshDeployment } = getMeshDeploymentVerifier();
    waitForMeshDeployment.mockResolvedValue({
        deployed: true,
        meshId: 'mesh123',
        endpoint: 'https://example.com/graphql',
    });
}

export const VALID_MESH_CONFIG = {
    meshConfig: {
        sources: [
            {
                name: 'magento',
                handler: {
                    graphql: {
                        endpoint: 'https://example.com/graphql',
                    },
                },
            },
        ],
    },
};
