/**
 * Mock Structure Validation Tests
 *
 * TDD: These tests ensure test mocks stay aligned with actual JSON configuration files.
 * Prevents the v3.0.0 mock drift issue where tests used outdated v2.0 structure.
 *
 * Pattern:
 * 1. Load actual components.json at test time
 * 2. Compare mock structure against actual structure
 * 3. Fail with actionable message if drift detected
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    mockRawRegistryV3,
    V3_COMPONENT_SECTIONS,
    createMaliciousRegistry,
    createMaliciousRegistryV3,
} from './ComponentRegistryManager.testUtils';

describe('Mock Structure Validation', () => {
    let actualComponentsJson: Record<string, unknown>;

    beforeAll(() => {
        const componentsPath = path.join(__dirname, '../../../../templates/components.json');
        actualComponentsJson = JSON.parse(fs.readFileSync(componentsPath, 'utf-8'));
    });

    describe('mockRawRegistryV3 alignment with components.json', () => {
        it('should have version 3.0.0', () => {
            expect(mockRawRegistryV3.version).toBe('3.0.0');
            expect(actualComponentsJson.version).toBe('3.0.0');
        });

        it('should have all v3.0.0 component sections present', () => {
            // All sections defined in V3_COMPONENT_SECTIONS should be present in mock
            V3_COMPONENT_SECTIONS.forEach(section => {
                expect(mockRawRegistryV3[section]).toBeDefined();
                expect(typeof mockRawRegistryV3[section]).toBe('object');
            });
        });

        it('should have at least one entry in each component section', () => {
            V3_COMPONENT_SECTIONS.forEach(section => {
                const sectionData = mockRawRegistryV3[section];
                expect(Object.keys(sectionData || {}).length).toBeGreaterThan(0);
            });
        });

        it('should have selectionGroups with all component types', () => {
            const expectedGroups = ['frontends', 'backends', 'dependencies', 'appBuilderApps'];
            expectedGroups.forEach(group => {
                expect(mockRawRegistryV3.selectionGroups?.[group as keyof typeof mockRawRegistryV3.selectionGroups]).toBeDefined();
            });
        });

        it('should have infrastructure section', () => {
            expect(mockRawRegistryV3.infrastructure).toBeDefined();
            expect(Object.keys(mockRawRegistryV3.infrastructure || {}).length).toBeGreaterThan(0);
        });

        it('should NOT have deprecated components map (v2.0 structure)', () => {
            // v3.0.0 mocks should NOT use the deprecated 'components' map
            expect(mockRawRegistryV3.components).toBeUndefined();
        });

        it('should have component definitions with required fields', () => {
            // Check frontends have name, description, configuration
            const frontends = mockRawRegistryV3.frontends;
            if (frontends) {
                Object.entries(frontends).forEach(([id, component]) => {
                    expect(component.name).toBeDefined();
                    expect(component.description).toBeDefined();
                    // Node version should be in configuration
                    if (component.configuration) {
                        expect(component.configuration.nodeVersion).toBeDefined();
                    }
                });
            }
        });

        it('should have backends with nodeVersion in configuration', () => {
            const backends = mockRawRegistryV3.backends;
            if (backends) {
                Object.entries(backends).forEach(([id, component]) => {
                    expect(component.name).toBeDefined();
                    expect(component.configuration?.nodeVersion).toBeDefined();
                });
            }
        });
    });

    describe('createMaliciousRegistry v3.0.0 support', () => {
        it('should create malicious registry for v3.0.0 frontends section', () => {
            const malicious = createMaliciousRegistryV3('frontends.eds', '20; rm -rf /');

            expect(malicious.version).toBe('3.0.0');
            expect(malicious.frontends?.eds.configuration?.nodeVersion).toBe('20; rm -rf /');
        });

        it('should create malicious registry for v3.0.0 backends section', () => {
            const malicious = createMaliciousRegistryV3('backends.adobe-commerce-paas', '20 && cat /etc/passwd');

            expect(malicious.backends?.['adobe-commerce-paas'].configuration?.nodeVersion).toBe('20 && cat /etc/passwd');
        });

        it('should create malicious registry for v3.0.0 mesh section', () => {
            const malicious = createMaliciousRegistryV3('mesh.commerce-mesh', '20`whoami`');

            expect(malicious.mesh?.['commerce-mesh'].configuration?.nodeVersion).toBe('20`whoami`');
        });

        it('should create malicious registry for v3.0.0 appBuilderApps section', () => {
            const malicious = createMaliciousRegistryV3('appBuilderApps.integration-service', '22$(id)');

            expect(malicious.appBuilderApps?.['integration-service'].configuration?.nodeVersion).toBe('22$(id)');
        });

        it('should preserve backward compatibility with v2.0 structure', () => {
            const malicious = createMaliciousRegistry('components.frontend1', '20; evil');

            // Should still have components map (v2.0)
            expect(malicious.components?.frontend1.configuration?.nodeVersion).toBe('20; evil');
        });

        it('should handle infrastructure section in both modes', () => {
            const maliciousV2 = createMaliciousRegistry('infrastructure.infra1', '20; evil', false);
            const maliciousV3 = createMaliciousRegistry('infrastructure.adobe-cli', '20; evil', true);

            expect(maliciousV2.infrastructure?.infra1.configuration?.nodeVersion).toBe('20; evil');
            // Note: adobe-cli in v3 mock doesn't have configuration, so this tests adding one
            expect(maliciousV3.infrastructure?.['adobe-cli'].configuration?.nodeVersion).toBe('20; evil');
        });
    });

    describe('actual components.json structure validation', () => {
        it('should have all expected top-level sections', () => {
            const expectedSections = [
                'frontends',
                'backends',
                'mesh',
                'dependencies',
                'appBuilderApps',
                'infrastructure',
                'services',
                'envVars',
                'selectionGroups',
            ];

            expectedSections.forEach(section => {
                expect(actualComponentsJson[section]).toBeDefined();
            });
        });

        it('should have v3.0.0 structure (not v2.0 components map)', () => {
            // v3.0.0 should NOT have a 'components' map at root level
            expect(actualComponentsJson.components).toBeUndefined();
            // v3.0.0 should have separate sections
            expect(actualComponentsJson.frontends).toBeDefined();
            expect(actualComponentsJson.backends).toBeDefined();
        });
    });
});
