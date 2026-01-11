/**
 * ComponentRepositoryResolver Tests
 *
 * Tests the resolver that extracts Git repository URLs from components.json
 */

import { ComponentRepositoryResolver } from '@/features/updates/services/componentRepositoryResolver';
import type { Logger } from '@/types/logger';

describe('ComponentRepositoryResolver', () => {
    let resolver: ComponentRepositoryResolver;
    let mockLogger: Logger;

    beforeEach(() => {
        mockLogger = {
            debug: jest.fn(),
            trace: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        // Use actual extension path for real components.json
        const extensionPath = process.cwd();
        resolver = new ComponentRepositoryResolver(extensionPath, mockLogger);
    });

    describe('getAllRepositories', () => {
        it('should load all Git-based components from components.json', async () => {
            const repositories = await resolver.getAllRepositories();

            // Verify we found components
            expect(repositories.size).toBeGreaterThan(0);

            // Verify expected components are present
            expect(repositories.has('headless-commerce-mesh')).toBe(true);
            expect(repositories.has('integration-service')).toBe(true);
        });

        it('should extract repository in owner/repo format', async () => {
            const repositories = await resolver.getAllRepositories();

            const meshRepo = repositories.get('headless-commerce-mesh');
            expect(meshRepo).toBeDefined();
            expect(meshRepo?.repository).toBe('skukla/headless-citisignal-mesh');
            expect(meshRepo?.name).toBe('Headless Commerce API Mesh');
        });

        it('should cache results on subsequent calls', async () => {
            const first = await resolver.getAllRepositories();
            const second = await resolver.getAllRepositories();

            // Should return same instance (cached)
            expect(first).toBe(second);
        });

        it('should clear cache when requested', async () => {
            const first = await resolver.getAllRepositories();
            resolver.clearCache();
            const second = await resolver.getAllRepositories();

            // Should return different instances after cache clear
            expect(first).not.toBe(second);
            // But with same content
            expect(first.size).toBe(second.size);
        });
    });

    describe('getRepositoryInfo', () => {
        it('should return repository info for valid component', async () => {
            const info = await resolver.getRepositoryInfo('headless-commerce-mesh');

            expect(info).toEqual({
                id: 'headless-commerce-mesh',
                repository: 'skukla/headless-citisignal-mesh',
                name: 'Headless Commerce API Mesh',
            });
        });

        it('should return null for non-existent component', async () => {
            const info = await resolver.getRepositoryInfo('non-existent-component');
            expect(info).toBeNull();
        });

        it('should return null for components without Git source', async () => {
            // Backend components don't have Git sources
            const info = await resolver.getRepositoryInfo('adobe-commerce-paas');
            expect(info).toBeNull();
        });
    });

    describe('URL parsing', () => {
        it('should handle URLs with .git extension', async () => {
            // This tests the internal URL parsing via actual components
            const repositories = await resolver.getAllRepositories();

            // All repositories should be in owner/repo format (no .git)
            for (const repo of repositories.values()) {
                expect(repo.repository).not.toContain('.git');
                expect(repo.repository).toMatch(/^[^/]+\/[^/]+$/);
            }
        });
    });

    describe('Component categories', () => {
        it('should extract from mesh category', async () => {
            const info = await resolver.getRepositoryInfo('headless-commerce-mesh');
            expect(info).toBeDefined();
        });

        it('should extract from appBuilderApps category', async () => {
            const info = await resolver.getRepositoryInfo('integration-service');
            expect(info).toBeDefined();
        });

        it('should extract from tools category', async () => {
            const info = await resolver.getRepositoryInfo('commerce-demo-ingestion');
            expect(info).toBeDefined();
        });
    });

    describe('Integration with UpdateManager', () => {
        it('should provide data in format expected by UpdateManager', async () => {
            const repositories = await resolver.getAllRepositories();

            // UpdateManager expects owner/repo format for GitHub API
            for (const repo of repositories.values()) {
                // Should be in owner/repo format
                expect(repo.repository).toMatch(/^[^/]+\/[^/]+$/);
                
                // Should not have protocol or domain
                expect(repo.repository).not.toContain('http');
                expect(repo.repository).not.toContain('github.com');
            }
        });
    });
});
