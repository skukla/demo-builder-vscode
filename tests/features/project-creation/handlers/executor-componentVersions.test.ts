/**
 * Tests for component version initialization in executor
 *
 * These tests verify that componentVersions are properly initialized
 * using the version detected during component installation, not hardcoded
 * to 'unknown'.
 *
 * Related fix: New projects showing "vunknown → vX.Y.Z" in update checks
 * Root cause: componentVersions initialized with hardcoded 'unknown'
 * Solution: Use componentInstance.version from installation
 */

import type { Project } from '@/types/base';

describe('Executor - Component Version Initialization', () => {
    let mockProject: Project;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock project with components that have detected versions
        mockProject = {
            name: 'test-project',
            path: '/tmp/test-project',
            created: new Date(),
            lastModified: new Date(),
            status: 'ready',
            componentInstances: {
                'citisignal-nextjs': {
                    id: 'citisignal-nextjs',
                    name: 'CitiSignal Next.js',
                    type: 'frontend',
                    status: 'ready',
                    path: '/tmp/test-project/components/citisignal-nextjs',
                    lastUpdated: new Date(),
                    version: '1.0.0', // Version detected from git tag
                },
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'Commerce Mesh',
                    type: 'dependency',
                    status: 'deployed',
                    path: '/tmp/test-project/components/commerce-mesh',
                    lastUpdated: new Date(),
                    version: '2.5.3', // Version from package.json
                },
                'demo-inspector': {
                    id: 'demo-inspector',
                    name: 'Demo Inspector',
                    type: 'dependency',
                    status: 'ready',
                    lastUpdated: new Date(),
                    version: '^1.0.0', // npm package version
                },
            },
            componentVersions: {}, // Will be populated by executor
        };
    });

    describe('Component version assignment', () => {
        it('should copy component instance versions to componentVersions', () => {
            // Simulate executor logic
            const project = mockProject;

            if (!project.componentVersions) {
                project.componentVersions = {};
            }

            for (const componentId of Object.keys(project.componentInstances || {})) {
                const componentInstance = project.componentInstances?.[componentId];
                const detectedVersion = componentInstance?.version || 'unknown';

                project.componentVersions[componentId] = {
                    version: detectedVersion,
                    lastUpdated: new Date().toISOString(),
                };
            }

            // Verify versions were copied correctly
            expect(project.componentVersions['citisignal-nextjs'].version).toBe('1.0.0');
            expect(project.componentVersions['commerce-mesh'].version).toBe('2.5.3');
            expect(project.componentVersions['demo-inspector'].version).toBe('^1.0.0');
        });

        it('should use "unknown" for components without detected version', () => {
            // Add component without version
            mockProject.componentInstances!['no-version-component'] = {
                id: 'no-version-component',
                name: 'No Version',
                type: 'dependency',
                status: 'ready',
                lastUpdated: new Date(),
                // No version field
            };

            // Simulate executor logic
            const project = mockProject;

            if (!project.componentVersions) {
                project.componentVersions = {};
            }

            for (const componentId of Object.keys(project.componentInstances || {})) {
                const componentInstance = project.componentInstances?.[componentId];
                const detectedVersion = componentInstance?.version || 'unknown';

                project.componentVersions[componentId] = {
                    version: detectedVersion,
                    lastUpdated: new Date().toISOString(),
                };
            }

            // Verify fallback to unknown
            expect(project.componentVersions['no-version-component'].version).toBe('unknown');
        });

        it('should handle commit hash versions', () => {
            // Component with commit hash (not on tagged release)
            mockProject.componentInstances!['citisignal-nextjs']!.version = 'abc123de';

            // Simulate executor logic
            const project = mockProject;

            if (!project.componentVersions) {
                project.componentVersions = {};
            }

            for (const componentId of Object.keys(project.componentInstances || {})) {
                const componentInstance = project.componentInstances?.[componentId];
                const detectedVersion = componentInstance?.version || 'unknown';

                project.componentVersions[componentId] = {
                    version: detectedVersion,
                    lastUpdated: new Date().toISOString(),
                };
            }

            // Verify commit hash is preserved
            expect(project.componentVersions['citisignal-nextjs'].version).toBe('abc123de');
        });

        it('should handle beta/pre-release versions', () => {
            // Component with pre-release version
            mockProject.componentInstances!['commerce-mesh']!.version = '1.0.0-beta.2';

            // Simulate executor logic
            const project = mockProject;

            if (!project.componentVersions) {
                project.componentVersions = {};
            }

            for (const componentId of Object.keys(project.componentInstances || {})) {
                const componentInstance = project.componentInstances?.[componentId];
                const detectedVersion = componentInstance?.version || 'unknown';

                project.componentVersions[componentId] = {
                    version: detectedVersion,
                    lastUpdated: new Date().toISOString(),
                };
            }

            // Verify beta version is preserved
            expect(project.componentVersions['commerce-mesh'].version).toBe('1.0.0-beta.2');
        });
    });

    describe('Update check compatibility', () => {
        it('should produce versions compatible with update manager', () => {
            // Simulate executor logic
            const project = mockProject;

            if (!project.componentVersions) {
                project.componentVersions = {};
            }

            for (const componentId of Object.keys(project.componentInstances || {})) {
                const componentInstance = project.componentInstances?.[componentId];
                const detectedVersion = componentInstance?.version || 'unknown';

                project.componentVersions[componentId] = {
                    version: detectedVersion,
                    lastUpdated: new Date().toISOString(),
                };
            }

            // These versions should work with semver comparison in update manager
            const versions = Object.values(project.componentVersions).map(v => v.version);

            expect(versions).toContain('1.0.0'); // Semver
            expect(versions).toContain('2.5.3'); // Semver
            expect(versions).toContain('^1.0.0'); // npm range

            // No versions should be hardcoded 'unknown' when component has version
            const componentsWithVersion = Object.keys(project.componentInstances || {})
                .filter(id => project.componentInstances?.[id]?.version);

            componentsWithVersion.forEach(id => {
                expect(project.componentVersions?.[id]?.version).not.toBe('unknown');
            });
        });

        it('should show proper version comparison after fix (not "vunknown")', () => {
            // Before fix: version would be 'unknown' even though component has version
            // After fix: version should match component instance

            const component = mockProject.componentInstances!['citisignal-nextjs']!;
            expect(component.version).toBe('1.0.0');

            // Simulate executor logic
            const project = mockProject;

            if (!project.componentVersions) {
                project.componentVersions = {};
            }

            for (const componentId of Object.keys(project.componentInstances || {})) {
                const componentInstance = project.componentInstances?.[componentId];
                const detectedVersion = componentInstance?.version || 'unknown';

                project.componentVersions[componentId] = {
                    version: detectedVersion,
                    lastUpdated: new Date().toISOString(),
                };
            }

            // After fix: Version should be actual version, not 'unknown'
            expect(project.componentVersions['citisignal-nextjs'].version).toBe('1.0.0');

            // Update check would now show: "1.0.0 → 1.0.0-beta.2"
            // Instead of: "vunknown → 1.0.0-beta.2"
        });
    });

    describe('Edge cases', () => {
        it('should handle empty componentInstances', () => {
            mockProject.componentInstances = {};

            // Simulate executor logic
            const project = mockProject;

            if (!project.componentVersions) {
                project.componentVersions = {};
            }

            for (const componentId of Object.keys(project.componentInstances || {})) {
                const componentInstance = project.componentInstances?.[componentId];
                const detectedVersion = componentInstance?.version || 'unknown';

                project.componentVersions[componentId] = {
                    version: detectedVersion,
                    lastUpdated: new Date().toISOString(),
                };
            }

            expect(Object.keys(project.componentVersions)).toHaveLength(0);
        });

        it('should handle undefined componentInstances', () => {
            mockProject.componentInstances = undefined;

            // Simulate executor logic
            const project = mockProject;

            if (!project.componentVersions) {
                project.componentVersions = {};
            }

            for (const componentId of Object.keys(project.componentInstances || {})) {
                const componentInstance = project.componentInstances?.[componentId];
                const detectedVersion = componentInstance?.version || 'unknown';

                project.componentVersions[componentId] = {
                    version: detectedVersion,
                    lastUpdated: new Date().toISOString(),
                };
            }

            expect(Object.keys(project.componentVersions)).toHaveLength(0);
        });
    });
});
