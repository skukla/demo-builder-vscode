/**
 * Manifest Error Investigation Tests
 *
 * These tests investigate the ENOENT manifest error:
 * "Error: ENOENT: no such file or directory, rename '<path>/ -> '<path>/"
 *
 * Root causes being investigated:
 * 1. Invalid or empty project.path values
 * 2. Race conditions in atomic write (temp file deleted before rename)
 * 3. Project directory deleted during save operation
 * 4. getCurrentProject triggering unexpected saves
 *
 * Related files:
 * - src/core/state/stateManager.ts (save chain)
 * - src/core/state/projectConfigWriter.ts (atomic write)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectConfigWriter } from '@/core/state/projectConfigWriter';
import type { Project } from '@/types';

// Mock fs/promises
jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;

// Create a detailed mock logger that captures all calls for debugging
const createDetailedMockLogger = () => {
    const calls: Array<{ level: string; message: string; args: unknown[] }> = [];
    return {
        debug: jest.fn((...args: unknown[]) => calls.push({ level: 'debug', message: String(args[0]), args })),
        info: jest.fn((...args: unknown[]) => calls.push({ level: 'info', message: String(args[0]), args })),
        warn: jest.fn((...args: unknown[]) => calls.push({ level: 'warn', message: String(args[0]), args })),
        error: jest.fn((...args: unknown[]) => calls.push({ level: 'error', message: String(args[0]), args })),
        getCalls: () => calls,
        getDebugCalls: () => calls.filter((c) => c.level === 'debug'),
        getErrorCalls: () => calls.filter((c) => c.level === 'error'),
        printCalls: () => calls.forEach((c) => console.log(`[${c.level}] ${c.message}`)),
    };
};

// Create a minimal valid project for testing
function createTestProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        path: '/test/path/my-project',
        created: new Date('2024-01-01T00:00:00Z'),
        componentSelections: {},
        componentInstances: [],
        componentConfigs: {},
        componentVersions: {},
        ...overrides,
    } as Project;
}

describe('Manifest Error Investigation', () => {
    let writer: ProjectConfigWriter;
    let mockLogger: ReturnType<typeof createDetailedMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = createDetailedMockLogger();
        writer = new ProjectConfigWriter(mockLogger as any);

        // Default mock implementations
        mockFs.access.mockResolvedValue(undefined);
        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);
        mockFs.rename.mockResolvedValue(undefined);
        mockFs.unlink.mockResolvedValue(undefined);
    });

    describe('ISSUE 1: Invalid project.path values', () => {
        it('should reject empty string path', async () => {
            // Given: A project with empty path
            const project = createTestProject({ path: '' });

            // When: Attempting to save
            await expect(writer.saveProjectConfig(project, project.path)).rejects.toThrow('Invalid project path');
        });

        it('should reject undefined path', async () => {
            // Given: A project with undefined path
            const project = createTestProject({ path: undefined as any });

            // When: Attempting to save
            await expect(writer.saveProjectConfig(project, project.path)).rejects.toThrow('Invalid project path');
        });

        it('should reject whitespace-only path', async () => {
            // Given: A project with whitespace path
            const project = createTestProject({ path: '   ' });

            // When: Attempting to save
            await expect(writer.saveProjectConfig(project, project.path)).rejects.toThrow('Invalid project path');
        });

        it('should reject null path', async () => {
            // Given: A project with null path
            const project = createTestProject({ path: null as any });

            // When: Attempting to save
            await expect(writer.saveProjectConfig(project, project.path)).rejects.toThrow('Invalid project path');
        });

        it('should accept valid path', async () => {
            // Given: A project with valid path
            const project = createTestProject({ path: '/valid/path/to/project' });

            // When: Saving
            await writer.saveProjectConfig(project, project.path);

            // Then: Should succeed - writeFile and rename should be called
            expect(mockFs.writeFile).toHaveBeenCalled();
            expect(mockFs.rename).toHaveBeenCalled();
        });
    });

    describe('ISSUE 2: Race condition - temp file missing before rename', () => {
        it('should detect when temp file disappears after write but before rename', async () => {
            // Given: A project and temp file that "disappears" between write and verify
            const project = createTestProject();
            const tempPath = path.join(project.path, '.demo-builder.json.tmp');

            // Simulate: writeFile succeeds, but access fails (temp file gone)
            mockFs.writeFile.mockResolvedValue(undefined);
            mockFs.access.mockImplementation(async (filePath) => {
                if (filePath === tempPath) {
                    throw new Error('ENOENT: no such file or directory');
                }
                return undefined;
            });

            // When: Attempting to save
            await expect(writer.saveProjectConfig(project, project.path)).rejects.toThrow('ENOENT');

            // Then: Error should be logged
            const errorCalls = mockLogger.getErrorCalls();
            expect(errorCalls.some((c) => c.message.includes('Failed to update project manifest'))).toBe(true);
        });

        it('should verify temp file exists before rename', async () => {
            // Given: Normal operation where temp file exists
            const project = createTestProject();

            // When: Saving
            await writer.saveProjectConfig(project, project.path);

            // Then: access should be called to verify temp file
            expect(mockFs.access).toHaveBeenCalled();
        });

        it('should handle ENOENT during rename', async () => {
            // Given: rename fails with ENOENT (the exact error we see in production)
            const project = createTestProject();
            const enoentError = new Error("ENOENT: no such file or directory, rename '/test/path/.demo-builder.json.tmp' -> '/test/path/.demo-builder.json'");
            (enoentError as any).code = 'ENOENT';

            mockFs.rename.mockRejectedValue(enoentError);

            // When: Attempting to save
            await expect(writer.saveProjectConfig(project, project.path)).rejects.toThrow('ENOENT');

            // Then: Error should be logged
            const errorCalls = mockLogger.getErrorCalls();
            expect(errorCalls.some((c) => c.message.includes('Failed to update project manifest'))).toBe(true);
        });
    });

    describe('ISSUE 3: Project directory deleted during operation', () => {
        it('should skip save when project directory no longer exists and no current project', async () => {
            // Given: A project whose directory has been deleted
            const project = createTestProject();

            // First access check (directory exists check) fails
            mockFs.access.mockRejectedValue(new Error('ENOENT'));

            // When: Attempting to save with currentProjectPath undefined
            await writer.saveProjectConfig(project, undefined);

            // Then: writeFile should NOT be called (save skipped silently)
            expect(mockFs.writeFile).not.toHaveBeenCalled();
        });

        it('should skip save when project directory differs from current project', async () => {
            // Given: A stale project reference (different from current)
            const project = createTestProject({ path: '/old/deleted/path' });
            const currentProjectPath = '/new/current/path';

            // Directory check fails (old path doesn't exist)
            mockFs.access.mockRejectedValue(new Error('ENOENT'));

            // When: Attempting to save stale project
            await writer.saveProjectConfig(project, currentProjectPath);

            // Then: writeFile should NOT be called (save skipped)
            expect(mockFs.writeFile).not.toHaveBeenCalled();
        });

        it('should proceed with save when directory missing but matches current project (new project case)', async () => {
            // Given: A new project being created (directory will be created)
            const project = createTestProject({ path: '/new/project/path' });

            // First access fails (directory doesn't exist yet)
            let accessCallCount = 0;
            mockFs.access.mockImplementation(async () => {
                accessCallCount++;
                if (accessCallCount === 1) {
                    // First call: directory check - doesn't exist
                    throw new Error('ENOENT');
                }
                // Subsequent calls: succeed (temp file verification)
                return undefined;
            });

            // When: Saving with current path matching
            await writer.saveProjectConfig(project, project.path);

            // Then: Should create directory and proceed
            expect(mockFs.mkdir).toHaveBeenCalledWith(project.path, { recursive: true });
            expect(mockFs.writeFile).toHaveBeenCalled();
        });
    });

    describe('ISSUE 4: Save chain behavior', () => {
        it('should save project with all fields', async () => {
            // Given: A project with all fields
            const project = createTestProject({
                name: 'debug-test-project',
                path: '/debug/test/path',
            });

            // When: Saving
            await writer.saveProjectConfig(project, '/debug/test/path');

            // Then: Should write both manifest and env file
            expect(mockFs.writeFile).toHaveBeenCalledTimes(2);
        });

        it('should write manifest to correct path', async () => {
            // Given: A valid project
            const project = createTestProject({ path: '/some/valid/path' });

            // When: Saving
            await writer.saveProjectConfig(project, project.path);

            // Then: Should write to temp file first
            const writeCalls = mockFs.writeFile.mock.calls;
            expect(writeCalls.some((call) => String(call[0]).endsWith('.tmp'))).toBe(true);
        });

        it('should rename temp file to manifest', async () => {
            // Given: A valid project
            const project = createTestProject({ path: '/manifest/paths/test' });

            // When: Saving
            await writer.saveProjectConfig(project, project.path);

            // Then: Should rename temp to manifest
            expect(mockFs.rename).toHaveBeenCalledWith(
                '/manifest/paths/test/.demo-builder.json.tmp',
                '/manifest/paths/test/.demo-builder.json'
            );
        });
    });

    describe('Error context preservation', () => {
        it('should preserve full error context when atomic write fails', async () => {
            // Given: A project and a specific error scenario
            const project = createTestProject({
                name: 'error-context-project',
                path: '/error/context/path',
            });

            const specificError = new Error('Specific file system error');
            mockFs.rename.mockRejectedValue(specificError);

            // When: Saving fails
            try {
                await writer.saveProjectConfig(project, project.path);
                fail('Should have thrown');
            } catch (error) {
                // Then: Original error preserved
                expect(error).toBe(specificError);
            }

            // And: Error should be logged
            const errorCalls = mockLogger.getErrorCalls();
            expect(errorCalls.some((c) => c.message.includes('Failed to update project manifest'))).toBe(true);
        });
    });

    describe('Concurrent save protection', () => {
        it('should handle rapid consecutive saves without race conditions', async () => {
            // Given: A valid project
            const project = createTestProject();
            let manifestWriteCount = 0;
            let renameCount = 0;

            mockFs.writeFile.mockImplementation(async (filePath) => {
                // Count only manifest temp file writes (not .env writes)
                if (String(filePath).endsWith('.tmp')) {
                    manifestWriteCount++;
                }
                // Simulate some async work
                await new Promise((resolve) => setTimeout(resolve, 10));
            });

            mockFs.rename.mockImplementation(async () => {
                renameCount++;
            });

            // When: Multiple saves happen rapidly
            const save1 = writer.saveProjectConfig(project, project.path);
            const save2 = writer.saveProjectConfig(project, project.path);
            const save3 = writer.saveProjectConfig(project, project.path);

            await Promise.all([save1, save2, save3]);

            // Then: All saves should complete (atomic write pattern preserves integrity)
            // Note: This test verifies the pattern works, not that concurrent saves are serialized
            // In production, StateManager should serialize saves
            expect(manifestWriteCount).toBe(3);
            expect(renameCount).toBe(3);
        });
    });
});

describe('StateManager Save Chain Investigation', () => {
    /**
     * These tests document the expected save chain behavior.
     * The chain is:
     *   getCurrentProject() → loadProjectFromPath() → saveProject() → projectConfigWriter.saveProjectConfig()
     *
     * This chain can trigger manifest writes when:
     * 1. Extension starts and loads existing project
     * 2. Wizard creates new project
     * 3. Background operations (mesh status polling) read project state
     *
     * The manifest error occurs somewhere in this chain with an invalid path.
     */

    it('should document the save chain for investigation', () => {
        // This test documents the call chain for reference
        const callChain = [
            'extension.ts:295 - getCurrentProject() called on startup',
            'stateManager.ts:134 - getCurrentProject() checks for cached project',
            'stateManager.ts:143 - If cached, calls loadProjectFromPath() to refresh',
            'stateManager.ts:286 - loadProjectFromPath() calls saveProject() with loaded data',
            'stateManager.ts:177 - saveProject() delegates to projectConfigWriter',
            'projectConfigWriter.ts:52 - saveProjectConfig() validates and writes',
            'projectConfigWriter.ts:97 - writeManifest() performs atomic write',
        ];

        // This chain is the source of the manifest error
        // The debug logging we added will reveal which step has invalid path
        expect(callChain.length).toBe(7);
    });
});
