/**
 * Mock Structure Validation Tests
 *
 * TDD: These tests ensure test mocks stay aligned with actual JSON configuration files.
 * Prevents mock drift where tests use outdated structure.
 *
 * Pattern:
 * 1. Load actual components.json at test time
 * 2. Compare mock structure against actual structure
 * 3. Fail with actionable message if drift detected
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    mockRawRegistry,
    COMPONENT_SECTIONS,
    createMaliciousRegistry,
} from './ComponentRegistryManager.testUtils';

describe('Mock Structure Validation', () => {
    let actualComponentsJson: Record<string, unknown>;

    beforeAll(() => {
        const componentsPath = path.join(__dirname, '../../../../templates/components.json');
        actualComponentsJson = JSON.parse(fs.readFileSync(componentsPath, 'utf-8'));
    });

    describe('mockRawRegistry alignment with components.json', () => {
        it('should have version 3.0.0', () => {
            expect(mockRawRegistry.version).toBe('3.0.0');
            expect(actualComponentsJson.version).toBe('3.0.0');
        });

        it('should have all component sections present', () => {
            // All sections defined in COMPONENT_SECTIONS should be present in mock
            COMPONENT_SECTIONS.forEach(section => {
                expect(mockRawRegistry[section]).toBeDefined();
                expect(typeof mockRawRegistry[section]).toBe('object');
            });
        });

        it('should have at least one entry in each component section', () => {
            COMPONENT_SECTIONS.forEach(section => {
                const sectionData = mockRawRegistry[section];
                expect(Object.keys(sectionData || {}).length).toBeGreaterThan(0);
            });
        });

        it('should have selectionGroups with all component types', () => {
            const expectedGroups = ['frontends', 'backends', 'dependencies', 'appBuilderApps'];
            expectedGroups.forEach(group => {
                expect(mockRawRegistry.selectionGroups?.[group as keyof typeof mockRawRegistry.selectionGroups]).toBeDefined();
            });
        });

        it('should have infrastructure section', () => {
            expect(mockRawRegistry.infrastructure).toBeDefined();
            expect(Object.keys(mockRawRegistry.infrastructure || {}).length).toBeGreaterThan(0);
        });

        it('should use section-based structure (not deprecated components map)', () => {
            // Current structure uses separate sections, not unified 'components' map
            expect(mockRawRegistry.components).toBeUndefined();
        });

        it('should have component definitions with required fields', () => {
            // Check frontends have name and description
            const frontends = mockRawRegistry.frontends;
            if (frontends) {
                Object.entries(frontends).forEach(([id, component]) => {
                    expect(component.name).toBeDefined();
                    expect(component.description).toBeDefined();
                    // Note: nodeVersion is optional - some components (EDS, PaaS) don't need Node
                });
            }
        });

        it('should have backends with name defined', () => {
            const backends = mockRawRegistry.backends;
            if (backends) {
                Object.entries(backends).forEach(([id, component]) => {
                    expect(component.name).toBeDefined();
                    // Note: nodeVersion is optional - PaaS is a remote service without Node requirement
                });
            }
        });

        it('should have nodeVersion for components that require local Node.js', () => {
            // headless (Next.js) requires Node for local development
            expect(mockRawRegistry.frontends?.headless?.configuration?.nodeVersion).toBe('24');
            // integration-service requires Node
            expect(mockRawRegistry.appBuilderApps?.['integration-service']?.configuration?.nodeVersion).toBe('22');
            // demo-inspector requires Node
            expect(mockRawRegistry.dependencies?.['demo-inspector']?.configuration?.nodeVersion).toBe('18');
            // commerce-mesh requires Node
            expect(mockRawRegistry.mesh?.['commerce-mesh']?.configuration?.nodeVersion).toBe('20');
        });

        it('should NOT have nodeVersion for remote services', () => {
            // EDS runs on Edge Delivery, not local Node
            expect(mockRawRegistry.frontends?.eds?.configuration?.nodeVersion).toBeUndefined();
            // PaaS is a remote Commerce instance
            expect(mockRawRegistry.backends?.['adobe-commerce-paas']?.configuration?.nodeVersion).toBeUndefined();
        });
    });

    describe('createMaliciousRegistry', () => {
        it('should create malicious registry for frontends section', () => {
            const malicious = createMaliciousRegistry('frontends.eds', '20; rm -rf /');

            expect(malicious.version).toBe('3.0.0');
            expect(malicious.frontends?.eds.configuration?.nodeVersion).toBe('20; rm -rf /');
        });

        it('should create malicious registry for backends section', () => {
            const malicious = createMaliciousRegistry('backends.adobe-commerce-paas', '20 && cat /etc/passwd');

            expect(malicious.backends?.['adobe-commerce-paas'].configuration?.nodeVersion).toBe('20 && cat /etc/passwd');
        });

        it('should create malicious registry for mesh section', () => {
            const malicious = createMaliciousRegistry('mesh.commerce-mesh', '20`whoami`');

            expect(malicious.mesh?.['commerce-mesh'].configuration?.nodeVersion).toBe('20`whoami`');
        });

        it('should create malicious registry for appBuilderApps section', () => {
            const malicious = createMaliciousRegistry('appBuilderApps.integration-service', '22$(id)');

            expect(malicious.appBuilderApps?.['integration-service'].configuration?.nodeVersion).toBe('22$(id)');
        });

        it('should handle infrastructure section', () => {
            const malicious = createMaliciousRegistry('infrastructure.adobe-cli', '20; evil');

            // adobe-cli in mock doesn't have configuration, so this tests adding one
            expect(malicious.infrastructure?.['adobe-cli'].configuration?.nodeVersion).toBe('20; evil');
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

        it('should have section-based structure (not deprecated components map)', () => {
            // Current structure uses separate sections, not unified 'components' map
            expect(actualComponentsJson.components).toBeUndefined();
            // Should have separate sections for frontends/backends
            expect(actualComponentsJson.frontends).toBeDefined();
            expect(actualComponentsJson.backends).toBeDefined();
        });
    });
});
