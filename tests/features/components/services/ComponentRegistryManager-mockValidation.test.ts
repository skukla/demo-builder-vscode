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
} from './ComponentRegistryManager.testUtils';
import { assertDefined } from '../../../helpers/resultAssertions';

describe('Mock Structure Validation', () => {
    let actualComponentsJson: Record<string, unknown>;

    beforeAll(() => {
        const componentsPath = path.join(__dirname, '../../../../src/features/components/config/components.json');
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
            const expectedGroups = ['frontends', 'backends', 'dependencies'];
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
            expect('components' in mockRawRegistry).toBe(false);
        });

        it('should have component definitions with required fields', () => {
            // Check frontends have name and description
            // The guard used to be `if (frontends)`, which meant a registry with NO
            // frontends passed this test having checked nothing. Assert it is there.
            const frontends = mockRawRegistry.frontends;
            assertDefined(frontends);
            expect(Object.keys(frontends).length).toBeGreaterThan(0);

            const problems: string[] = [];
            Object.entries(frontends).forEach(([id, component]) => {
                if (component.name === undefined) problems.push(`frontends.${id}: no name`);
                if (component.description === undefined) problems.push(`frontends.${id}: no description`);
            });
            expect(problems).toStrictEqual([]);
        });

        it('should have backends with name defined', () => {
            const backends = mockRawRegistry.backends;
            assertDefined(backends);
            expect(Object.keys(backends).length).toBeGreaterThan(0);

            const problems: string[] = [];
            Object.entries(backends).forEach(([id, component]) => {
                if (component.name === undefined) problems.push(`backends.${id}: no name`);
            });
            expect(problems).toStrictEqual([]);
        });
    });

    describe('actual components.json structure validation', () => {
        it('should have all expected top-level sections', () => {
            const expectedSections = [
                'frontends',
                'backends',
                'mesh',
                'dependencies',
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
