/**
 * Tests for PrerequisitesManager - Installation Orchestration
 * Tests getInstallSteps and infrastructure version removal
 */

// Mock debugLogger FIRST to prevent "Logger not initialized" errors
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

jest.mock('@/core/config/ConfigurationLoader');
jest.mock('@/core/di');

import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import {
    setupMocks,
    setupConfigLoader,
    createDynamicInstallPrerequisite,
    type TestMocks,
} from './PrerequisitesManager.testUtils';

describe('PrerequisitesManager - Installation Orchestration', () => {
    let manager: PrerequisitesManager;
    let mocks: TestMocks;

    beforeEach(() => {
        mocks = setupMocks();
        setupConfigLoader();
        manager = new PrerequisitesManager('/mock/extension/path', mocks.logger);
    });

    describe('infrastructure version removal', () => {
        it('should return empty steps array when no nodeVersions provided', async () => {
            // Given: Node prerequisite with dynamic installation
            const nodePrereq = createDynamicInstallPrerequisite();

            // When: getInstallSteps called without nodeVersions option
            const result = manager.getInstallSteps(nodePrereq, {});

            // Then: Returns empty steps array (no fallback version)
            expect(result).not.toBeNull();
            expect(result?.steps).toHaveLength(0);
        });

        it('should not have infrastructureNodeVersion field', () => {
            // Given: PrerequisitesManager instantiated
            // When: Checking instance properties
            // Then: No infrastructureNodeVersion field exists
            expect(manager).not.toHaveProperty('infrastructureNodeVersion');
        });

        it('should not reference infrastructure nodeVersion in components.json mock', () => {
            // Given: components.json loaded
            const fs = require('fs');
            const componentsJson = JSON.parse(fs.readFileSync());

            // When: Checking infrastructure section
            // Then: No nodeVersion field present
            expect(componentsJson.infrastructure?.['adobe-cli']).toBeDefined();
            expect(componentsJson.infrastructure['adobe-cli'].nodeVersion).toBeUndefined();
        });
    });
});
