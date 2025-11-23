/**
 * Cache Invalidation Integration Tests
 *
 * Tests that when a prerequisite is installed, the cache is invalidated
 * for both the prerequisite itself AND any prerequisites that depend on it.
 *
 * Bug: Adobe I/O CLI cache remained stale after Node.js installation,
 * causing "Node not installed, skipping" errors even after Node was installed.
 */

import { handleInstallPrerequisite } from '@/features/prerequisites/handlers/installHandler';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';

describe('Cache Invalidation for Dependent Prerequisites', () => {
    let context: HandlerContext;
    let invalidatedCaches: string[];

    beforeEach(() => {
        invalidatedCaches = [];

        // Mock PrerequisitesManager with cache tracking
        const mockCacheManager = {
            invalidate: jest.fn((id: string) => {
                invalidatedCaches.push(id);
            }),
            get: jest.fn(),
            set: jest.fn(),
            clearAll: jest.fn(),
        };

        const mockPrereqManager = {
            getCacheManager: () => mockCacheManager,
            checkPrerequisite: jest.fn().mockResolvedValue({ installed: true, version: '20.0.0' }),
            checkVersionSatisfaction: jest.fn().mockResolvedValue(false), // Version NOT satisfied, needs install
            loadConfig: jest.fn(),
            resolveDependencies: jest.fn(),
            getInstallSteps: jest.fn().mockReturnValue({
                steps: [
                    {
                        name: 'Install prerequisite',
                        message: 'Installing...',
                        command: 'echo "Installing"',
                    },
                ],
            }),
        } as unknown as PrerequisitesManager;

        // Mock context
        const prerequisites = [
            { id: 'node', name: 'Node.js', check: { command: 'node --version' } },
            {
                id: 'aio-cli',
                name: 'Adobe I/O CLI',
                check: { command: 'aio --version' },
                depends: ['node'],  // Depends on Node
                perNodeVersion: true,
            },
            {
                id: 'git',
                name: 'Git',
                check: { command: 'git --version' },
            },
        ];

        // Initialize prerequisite states map
        const statesMap = new Map();
        prerequisites.forEach((prereq, index) => {
            statesMap.set(index, {
                prereq,
                result: { installed: false, version: '', canInstall: true },
            });
        });

        context = {
            prereqManager: mockPrereqManager,
            sharedState: {
                currentPrerequisites: prerequisites,
                currentPrerequisiteStates: statesMap,
            },
            sendMessage: jest.fn().mockResolvedValue(undefined),
            logger: {
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            },
            stepLogger: {
                log: jest.fn(),
            },
            debugLogger: {
                debug: jest.fn(),
            },
            progressUnifier: {
                executeStep: jest.fn().mockResolvedValue(undefined),
            },
        } as unknown as HandlerContext;
    });

    it('should invalidate cache for the installed prerequisite', async () => {
        // Install Node.js
        await handleInstallPrerequisite(context, {
            prereqId: 0,  // Node.js
            version: '20',  // Specify version to avoid early return
        });

        // Verify Node cache was invalidated
        expect(invalidatedCaches).toContain('node');
    });

    it('should invalidate cache for prerequisites that depend on the installed one', async () => {
        // Install Node.js
        await handleInstallPrerequisite(context, {
            prereqId: 0,  // Node.js
            version: '20',  // Specify version to avoid early return
        });

        // Verify both Node AND Adobe CLI caches were invalidated
        expect(invalidatedCaches).toContain('node');
        expect(invalidatedCaches).toContain('aio-cli');  // Should be invalidated because it depends on Node
    });

    it('should NOT invalidate cache for prerequisites that do NOT depend on the installed one', async () => {
        // Install Node.js
        await handleInstallPrerequisite(context, {
            prereqId: 0,  // Node.js
            version: '20',  // Specify version to avoid early return
        });

        // Git does not depend on Node, so its cache should NOT be invalidated
        expect(invalidatedCaches).not.toContain('git');
    });

    it('should handle prerequisites with no dependents gracefully', async () => {
        // Install Git (has no dependents)
        await handleInstallPrerequisite(context, {
            prereqId: 2,  // Git
        });

        // Only Git cache should be invalidated
        expect(invalidatedCaches).toEqual(['git']);
    });

    it('should log cache invalidation for dependents', async () => {
        // Install Node.js
        await handleInstallPrerequisite(context, {
            prereqId: 0,  // Node.js
            version: '20',  // Specify version to avoid early return
        });

        // Verify logging for dependent cache invalidation
        expect(context.logger.debug).toHaveBeenCalledWith(
            expect.stringContaining('Cache invalidated for dependent aio-cli')
        );
    });
});
