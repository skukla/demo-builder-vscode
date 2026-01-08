/**
 * ProjectConfigWriter Atomic Write Tests
 *
 * Tests for atomic file write behavior in writeManifest() method.
 * Atomic writes prevent JSON corruption from interrupted/concurrent writes.
 * Pattern: write to temp file first, then rename (atomic on POSIX).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectConfigWriter } from '@/core/state/projectConfigWriter';
import type { Project } from '@/types';

// Mock fs/promises
jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;

// Create a minimal mock logger
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

// Create a minimal valid project for testing
function createTestProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        path: '/test/path',
        created: new Date('2024-01-01T00:00:00Z'),
        componentSelections: {},
        componentInstances: [],
        componentConfigs: {},
        componentVersions: {},
        ...overrides,
    } as Project;
}

describe('ProjectConfigWriter atomic writes', () => {
    let writer: ProjectConfigWriter;

    beforeEach(() => {
        jest.clearAllMocks();
        writer = new ProjectConfigWriter(mockLogger as any);

        // Default mock implementations for directory checks
        mockFs.access.mockResolvedValue(undefined);
        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);
        mockFs.rename.mockResolvedValue(undefined);
        mockFs.unlink.mockResolvedValue(undefined);
    });

    describe('writeManifest (atomic writes)', () => {
        it('should write to temp file first, then rename for atomic write', async () => {
            // Given: A valid project
            const project = createTestProject();

            // When: Saving project config (which calls writeManifest internally)
            await writer.saveProjectConfig(project, project.path);

            // Then: Should write to temp file first
            const manifestPath = path.join(project.path, '.demo-builder.json');
            const tempPath = `${manifestPath}.tmp`;

            // Verify temp file write was called
            expect(mockFs.writeFile).toHaveBeenCalledWith(
                tempPath,
                expect.any(String),
            );

            // Verify rename was called to atomically move temp to final
            expect(mockFs.rename).toHaveBeenCalledWith(tempPath, manifestPath);

            // Verify write happened before rename (atomic pattern)
            const writeCallOrder = mockFs.writeFile.mock.invocationCallOrder[0];
            const renameCallOrder = mockFs.rename.mock.invocationCallOrder[0];
            expect(writeCallOrder).toBeLessThan(renameCallOrder);
        });

        it('should clean up temp file when write fails', async () => {
            // Given: A project and fs.writeFile that will fail
            const project = createTestProject();
            const writeError = new Error('Disk full');
            mockFs.writeFile.mockRejectedValue(writeError);

            // When: Saving project config
            await expect(writer.saveProjectConfig(project, project.path)).rejects.toThrow('Disk full');

            // Then: Should attempt to clean up temp file
            const manifestPath = path.join(project.path, '.demo-builder.json');
            const tempPath = `${manifestPath}.tmp`;
            expect(mockFs.unlink).toHaveBeenCalledWith(tempPath);
        });

        it('should clean up temp file when rename fails', async () => {
            // Given: A project and fs.rename that will fail
            const project = createTestProject();
            const renameError = new Error('Cross-device link');
            mockFs.rename.mockRejectedValue(renameError);

            // When: Saving project config
            await expect(writer.saveProjectConfig(project, project.path)).rejects.toThrow('Cross-device link');

            // Then: Should attempt to clean up temp file
            const manifestPath = path.join(project.path, '.demo-builder.json');
            const tempPath = `${manifestPath}.tmp`;
            expect(mockFs.unlink).toHaveBeenCalledWith(tempPath);
        });

        it('should propagate original error after cleanup attempt', async () => {
            // Given: A project with fs.writeFile that fails, and cleanup also fails
            const project = createTestProject();
            const originalError = new Error('Original write error');
            mockFs.writeFile.mockRejectedValue(originalError);
            mockFs.unlink.mockRejectedValue(new Error('Cleanup failed'));

            // When: Saving project config
            // Then: Should throw the ORIGINAL error, not the cleanup error
            await expect(writer.saveProjectConfig(project, project.path)).rejects.toThrow('Original write error');

            // Verify cleanup was attempted (even though it failed)
            expect(mockFs.unlink).toHaveBeenCalled();

            // Verify error was logged
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to update project manifest',
                originalError,
            );
        });

        it('should write valid JSON content to manifest', async () => {
            // Given: A project with specific data
            const project = createTestProject({
                name: 'my-demo-project',
                adobe: {
                    organization: { id: 'org-123', name: 'Test Org' },
                } as any,
            });

            // When: Saving project config
            await writer.saveProjectConfig(project, project.path);

            // Then: Written content should be valid JSON with expected structure
            const writeCall = mockFs.writeFile.mock.calls.find(
                (call) => call[0].toString().endsWith('.tmp'),
            );
            expect(writeCall).toBeDefined();

            const writtenContent = writeCall![1] as string;
            const parsed = JSON.parse(writtenContent);

            expect(parsed.name).toBe('my-demo-project');
            expect(parsed.version).toBe('1.0.0');
            expect(parsed.adobe).toBeDefined();
        });

        it('should include selectedAddons in manifest', async () => {
            // Given: A project with selectedAddons (e.g., demo-inspector)
            const project = createTestProject({
                name: 'project-with-addons',
                selectedPackage: 'citisignal',
                selectedStack: 'eds-paas',
                selectedAddons: ['demo-inspector', 'adobe-commerce-aco'],
            });

            // When: Saving project config
            await writer.saveProjectConfig(project, project.path);

            // Then: Written content should include selectedAddons
            const writeCall = mockFs.writeFile.mock.calls.find(
                (call) => call[0].toString().endsWith('.tmp'),
            );
            expect(writeCall).toBeDefined();

            const writtenContent = writeCall![1] as string;
            const parsed = JSON.parse(writtenContent);

            expect(parsed.selectedPackage).toBe('citisignal');
            expect(parsed.selectedStack).toBe('eds-paas');
            expect(parsed.selectedAddons).toEqual(['demo-inspector', 'adobe-commerce-aco']);
        });
    });
});
