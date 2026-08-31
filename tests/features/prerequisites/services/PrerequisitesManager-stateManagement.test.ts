/**
 * Tests for PrerequisitesManager - State Management
 * Tests configuration loading and prerequisite lookup
 */

// Mock debugLogger FIRST to prevent "Logger not initialized" errors
jest.mock('@/core/config/ConfigurationLoader');

import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import {
    setupMocks,
    setupConfigLoader,
    mockConfig,
    type TestMocks,
} from './PrerequisitesManager.testUtils';
import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';

describe('PrerequisitesManager - State Management', () => {
    let manager: PrerequisitesManager;
    let mocks: TestMocks;

    beforeEach(() => {
        mocks = setupMocks();
        setupConfigLoader();
        manager = new PrerequisitesManager('/mock/extension/path', mocks.logger, mocks.executor, new PrerequisitesCacheManager());
    });

    describe('loadConfig', () => {
        it('should load prerequisites configuration', async () => {
            const config = await manager.loadConfig();

            expect(config).toEqual(mockConfig);
            expect(config.prerequisites).toHaveLength(3);
        });

        it('should handle configuration load errors', async () => {
            const { ConfigurationLoader } = require('@/core/config/ConfigurationLoader');
            ConfigurationLoader.mockImplementation(() => ({
                load: jest.fn().mockRejectedValue(new Error('Config not found')),
            }));

            manager = new PrerequisitesManager('/mock/extension/path', mocks.logger, mocks.executor, new PrerequisitesCacheManager());

            await expect(manager.loadConfig()).rejects.toThrow('Config not found');
        });
    });

    describe('getPrerequisiteById', () => {
        it('should return prerequisite by id', async () => {
            const prereq = await manager.getPrerequisiteById('node');

            expect(prereq).toBeDefined();
            expect(prereq?.id).toBe('node');
            expect(prereq?.name).toBe('Node.js');
        });

        it('should return undefined for non-existent id', async () => {
            const prereq = await manager.getPrerequisiteById('non-existent');

            expect(prereq).toBeUndefined();
        });
    });
});
