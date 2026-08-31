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
import { createMockLogger } from '../../helpers/loggerFake';

// Mock fs/promises
jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;

// Create a minimal mock logger
const mockLogger = createMockLogger();

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
            expect(mockFs.writeFile).toHaveBeenCalledWith(tempPath, expect.any(String));

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
            await expect(writer.saveProjectConfig(project, project.path)).rejects.toThrow(
                'Disk full'
            );

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
            await expect(writer.saveProjectConfig(project, project.path)).rejects.toThrow(
                'Cross-device link'
            );

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
            await expect(writer.saveProjectConfig(project, project.path)).rejects.toThrow(
                'Original write error'
            );

            // Verify cleanup was attempted (even though it failed)
            expect(mockFs.unlink).toHaveBeenCalled();

            // Verify error was logged
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to update project manifest',
                originalError
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
            const writeCall = mockFs.writeFile.mock.calls.find((call) =>
                call[0].toString().endsWith('.tmp')
            );
            expect(writeCall).toBeDefined();

            const writtenContent = writeCall![1] as string;
            const parsed = JSON.parse(writtenContent);

            expect(parsed.name).toBe('my-demo-project');
            expect(parsed.version).toBe('1.0.0');
            expect(parsed.adobe).toBeDefined();
        });

        it('should include selectedAddons in manifest', async () => {
            // Given: A project with selectedAddons (e.g., adobe-commerce-aco)
            const project = createTestProject({
                name: 'project-with-addons',
                selectedPackage: 'citisignal',
                selectedStack: 'eds-paas',
                selectedAddons: ['adobe-commerce-aco', 'adobe-commerce-aco'],
            });

            // When: Saving project config
            await writer.saveProjectConfig(project, project.path);

            // Then: Written content should include selectedAddons
            const writeCall = mockFs.writeFile.mock.calls.find((call) =>
                call[0].toString().endsWith('.tmp')
            );
            expect(writeCall).toBeDefined();

            const writtenContent = writeCall![1] as string;
            const parsed = JSON.parse(writtenContent);

            expect(parsed.selectedPackage).toBe('citisignal');
            expect(parsed.selectedStack).toBe('eds-paas');
            expect(parsed.selectedAddons).toEqual(['adobe-commerce-aco', 'adobe-commerce-aco']);
        });

        it('should include customBlockLibraries in manifest', async () => {
            // Given: A project with custom block libraries
            const project = createTestProject({
                name: 'project-with-custom-blocks',
                customBlockLibraries: [
                    {
                        name: 'my-blocks',
                        source: {
                            owner: 'user',
                            repo: 'blocks',
                            branch: 'main',
                        },
                    },
                ],
            });

            // When: Saving project config
            await writer.saveProjectConfig(project, project.path);

            // Then: Written content should include customBlockLibraries
            const writeCall = mockFs.writeFile.mock.calls.find((call) =>
                call[0].toString().endsWith('.tmp')
            );
            expect(writeCall).toBeDefined();

            const writtenContent = writeCall![1] as string;
            const parsed = JSON.parse(writtenContent);

            expect(parsed.customBlockLibraries).toEqual([
                {
                    name: 'my-blocks',
                    source: { owner: 'user', repo: 'blocks', branch: 'main' },
                },
            ]);
        });

        // Regression: persisting aiPrompts. Without these, the F3 prompt CRUD
        // works in memory but doesn't survive a save+reload — Duplicate then
        // appears to "replace" the original because the backend reads aiPrompts
        // back as empty.
        it('should include aiPrompts in manifest when project has saved prompts', async () => {
            const project = createTestProject({
                name: 'project-with-ai-prompts',
                aiPrompts: [
                    { id: 'u1', title: 'My first prompt', prompt: 'Do thing one' },
                    { id: 'u2', title: 'My second prompt', prompt: 'Do thing two' },
                ],
            });

            await writer.saveProjectConfig(project, project.path);

            const writeCall = mockFs.writeFile.mock.calls.find((call) =>
                call[0].toString().endsWith('.tmp')
            );
            expect(writeCall).toBeDefined();
            const parsed = JSON.parse(writeCall![1] as string);
            expect(parsed.aiPrompts).toEqual([
                { id: 'u1', title: 'My first prompt', prompt: 'Do thing one' },
                { id: 'u2', title: 'My second prompt', prompt: 'Do thing two' },
            ]);
        });

        it('should omit aiPrompts from manifest when undefined', async () => {
            const project = createTestProject({ name: 'no-prompts' });
            await writer.saveProjectConfig(project, project.path);

            const writeCall = mockFs.writeFile.mock.calls.find((call) =>
                call[0].toString().endsWith('.tmp')
            );
            const parsed = JSON.parse(writeCall![1] as string);
            expect(parsed.aiPrompts).toBeUndefined();
        });

        it('should omit aiPrompts from manifest when empty array', async () => {
            const project = createTestProject({ name: 'empty-prompts', aiPrompts: [] });
            await writer.saveProjectConfig(project, project.path);

            const writeCall = mockFs.writeFile.mock.calls.find((call) =>
                call[0].toString().endsWith('.tmp')
            );
            const parsed = JSON.parse(writeCall![1] as string);
            expect(parsed.aiPrompts).toBeUndefined();
        });

        // AI-context freshness stamp: the version of the AI bundle that was last
        // generated into this project. Persisted so the on-open freshness check
        // can compare it against the current AI_CONTEXT_VERSION constant.
        it('should include aiContextVersion in manifest when set', async () => {
            const project = createTestProject({ name: 'stamped', aiContextVersion: 3 });
            await writer.saveProjectConfig(project, project.path);

            const writeCall = mockFs.writeFile.mock.calls.find((call) =>
                call[0].toString().endsWith('.tmp')
            );
            const parsed = JSON.parse(writeCall![1] as string);
            expect(parsed.aiContextVersion).toBe(3);
        });

        // ADR-013 hash-and-skip: per-file sha-256 hashes of the last generated
        // AI bundle, keyed by posix project-relative path. Persisted so the
        // GeneratedFileWriter can tell "ours" from "user-edited" across sessions.
        it('should include aiFileHashes in manifest when non-empty', async () => {
            const project = createTestProject({
                name: 'hashed',
                aiFileHashes: { 'AGENTS.md': 'abc123', '.mcp.json': 'def456' },
            });
            await writer.saveProjectConfig(project, project.path);

            const writeCall = mockFs.writeFile.mock.calls.find((call) =>
                call[0].toString().endsWith('.tmp')
            );
            const parsed = JSON.parse(writeCall![1] as string);
            expect(parsed.aiFileHashes).toEqual({ 'AGENTS.md': 'abc123', '.mcp.json': 'def456' });
        });

        it('should omit aiFileHashes from manifest when undefined', async () => {
            const project = createTestProject({ name: 'no-hashes' });
            await writer.saveProjectConfig(project, project.path);

            const writeCall = mockFs.writeFile.mock.calls.find((call) =>
                call[0].toString().endsWith('.tmp')
            );
            const parsed = JSON.parse(writeCall![1] as string);
            expect(parsed.aiFileHashes).toBeUndefined();
        });

        // Present-but-empty is not the same as absent: the loader's legacy
        // migrations key off absence — match the omit-when-empty siblings.
        it('should omit aiFileHashes from manifest when empty object', async () => {
            const project = createTestProject({ name: 'empty-hashes', aiFileHashes: {} });
            await writer.saveProjectConfig(project, project.path);

            const writeCall = mockFs.writeFile.mock.calls.find((call) =>
                call[0].toString().endsWith('.tmp')
            );
            const parsed = JSON.parse(writeCall![1] as string);
            expect(parsed.aiFileHashes).toBeUndefined();
        });

        // Publish-key renewal stamp. Helix keys expire in ~1 year and the
        // activation sweep decides what is due from this field alone — if it does
        // not survive the write, every storefront looks "never registered" on
        // every launch and re-mints a key each time.
        it('should include publishKeyRegisteredAt in manifest when set', async () => {
            const project = createTestProject({
                name: 'keyed',
                publishKeyRegisteredAt: '2026-08-15T12:00:00.000Z',
            });
            await writer.saveProjectConfig(project, project.path);

            const writeCall = mockFs.writeFile.mock.calls.find((call) =>
                call[0].toString().endsWith('.tmp')
            );
            const parsed = JSON.parse(writeCall![1] as string);
            expect(parsed.publishKeyRegisteredAt).toBe('2026-08-15T12:00:00.000Z');
        });

        it('should OMIT publishKeyRegisteredAt when the project has never been stamped', async () => {
            // Absent must stay absent: a present-but-empty value would read back as
            // an unparseable stamp rather than "never", and the sweep's "renew when
            // absent" branch is what covers every pre-feature storefront.
            const project = createTestProject({ name: 'unkeyed' });
            await writer.saveProjectConfig(project, project.path);

            const writeCall = mockFs.writeFile.mock.calls.find((call) =>
                call[0].toString().endsWith('.tmp')
            );
            const parsed = JSON.parse(writeCall![1] as string);
            expect(parsed.publishKeyRegisteredAt).toBeUndefined();
        });

        // ADR-011 D3 Step 07 retired the singular meshState/appState write-side;
        // PL-1 phase 2 removed the fields from Project entirely. The manifest
        // the writer emits must never carry the singular keys — pinned so a
        // regression reintroducing them fails here.
        it('should NOT write meshState/appState (the keyed map is the only persisted model)', async () => {
            const project = createTestProject({
                name: 'deployed-integration',
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        envVars: { A: '1' },
                        sourceHash: 'abc',
                        lastDeployed: '2026-07-15T00:00:00.000Z',
                        endpoint: 'https://mesh/graphql',
                    },
                    'acme-widget': {
                        kind: 'integration',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        url: 'https://acme.adobeio-static.net',
                        deployedUrls: { main: 'https://acme.adobeio-static.net' },
                        lastDeployed: '2026-07-15T00:00:00.000Z',
                        sourceHash: null,
                    },
                },
            });

            await writer.saveProjectConfig(project, project.path);

            const writeCall = mockFs.writeFile.mock.calls.find((call) =>
                call[0].toString().endsWith('.tmp')
            );
            const parsed = JSON.parse(writeCall![1] as string);
            expect(parsed.meshState).toBeUndefined();
            expect(parsed.appState).toBeUndefined();
        });

        it('should omit appState from manifest when the integration is not deployed', async () => {
            const project = createTestProject({ name: 'no-app' });
            await writer.saveProjectConfig(project, project.path);

            const writeCall = mockFs.writeFile.mock.calls.find((call) =>
                call[0].toString().endsWith('.tmp')
            );
            const parsed = JSON.parse(writeCall![1] as string);
            expect(parsed.appState).toBeUndefined();
        });

        // ADR-011 D3 Step 01: the keyed appBuilderComponents map is the durable
        // model. Without serializing it, N-integration state evaporates on reload
        // (the loader could only rebuild 1 mesh + 1 integration from the legacy
        // singletons). Omit-when-empty mirrors the aiPrompts convention.
        describe('appBuilderComponents persistence (ADR-011 D3 Step 01)', () => {
            const keyedEntries = {
                'commerce-eds-mesh': {
                    kind: 'mesh' as const,
                    status: 'deployed' as const,
                    source: { owner: 'skukla', repo: 'commerce-eds-mesh', branch: 'main' },
                    endpoint: 'https://mesh.example/graphql',
                    sourceHash: null,
                    lastDeployed: '2026-07-15T00:00:00.000Z',
                    providesEnvVars: { MESH_ENDPOINT: 'https://mesh.example/graphql' },
                },
                'acme-widget': {
                    kind: 'integration' as const,
                    status: 'deployed' as const,
                    name: 'ACME Widget',
                    source: { owner: 'acme', repo: 'widget', branch: 'main' },
                    url: 'https://acme.adobeio-static.net',
                    deployedUrls: { main: 'https://acme.adobeio-static.net' },
                    lastDeployed: '2026-07-15T00:00:00.000Z',
                },
            };

            function parsedManifest(): Record<string, unknown> {
                const writeCall = mockFs.writeFile.mock.calls.find((call) =>
                    call[0].toString().endsWith('.tmp')
                );
                expect(writeCall).toBeDefined();
                return JSON.parse(writeCall![1] as string);
            }

            it('should serialize all keyed appBuilderComponents entries verbatim', async () => {
                const project = createTestProject({
                    name: 'two-integrations',
                    appBuilderComponents: keyedEntries,
                });

                await writer.saveProjectConfig(project, project.path);

                expect(parsedManifest().appBuilderComponents).toEqual(keyedEntries);
            });

            it('should persist the integration display name', async () => {
                const project = createTestProject({
                    name: 'named-integration',
                    appBuilderComponents: { 'acme-widget': keyedEntries['acme-widget'] },
                });

                await writer.saveProjectConfig(project, project.path);

                const parsed = parsedManifest();
                const map = parsed.appBuilderComponents as Record<string, { name?: string }>;
                expect(map['acme-widget'].name).toBe('ACME Widget');
            });

            it('should omit appBuilderComponents from manifest when undefined', async () => {
                const project = createTestProject({ name: 'no-keyed-map' });
                await writer.saveProjectConfig(project, project.path);

                expect(parsedManifest().appBuilderComponents).toBeUndefined();
            });

            it('should omit appBuilderComponents from manifest when empty', async () => {
                const project = createTestProject({
                    name: 'empty-keyed-map',
                    appBuilderComponents: {},
                });
                await writer.saveProjectConfig(project, project.path);

                expect(parsedManifest().appBuilderComponents).toBeUndefined();
            });
        });
    });
});
