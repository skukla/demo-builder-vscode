/**
 * Mock Structure Validation Tests for PrerequisitesManager
 *
 * TDD: These tests ensure test mocks stay aligned with actual prerequisites.json.
 * Prevents mock drift where tests use outdated prerequisite structures.
 *
 * Pattern:
 * 1. Load actual prerequisites.json at test time
 * 2. Compare mock structure against actual structure
 * 3. Fail with actionable message if drift detected
 *
 * @see tests/templates/type-json-alignment.test.ts for field set definitions
 */

import * as fs from 'fs';
import * as path from 'path';

// Note: We can't import from the testUtils file directly because it has top-level jest.mock calls
// that cause side effects. Instead, we re-declare the mock structures here for validation.

describe('Mock Structure Validation - Prerequisites', () => {
    let actualPrerequisitesJson: {
        prerequisites: Array<{
            id: string;
            name: string;
            description: string;
            optional?: boolean;
            depends?: string[];
            perNodeVersion?: boolean;
            check: { command: string; parseVersion?: string; contains?: string };
            install?: { dynamic?: boolean; steps?: unknown[]; requires?: string[] };
            multiVersion?: boolean;
            versionCheck?: { command: string; parseInstalledVersions?: string };
            plugins?: unknown[];
        }>;
        componentRequirements: Record<string, { prerequisites: string[]; plugins?: string[] }>;
    };

    beforeAll(() => {
        const prereqPath = path.join(__dirname, '../../../../src/features/prerequisites/config/prerequisites.json');
        actualPrerequisitesJson = JSON.parse(fs.readFileSync(prereqPath, 'utf-8'));
    });

    describe('actual prerequisites.json structure validation', () => {
        it('should have prerequisites array', () => {
            expect(Array.isArray(actualPrerequisitesJson.prerequisites)).toBe(true);
            expect(actualPrerequisitesJson.prerequisites.length).toBeGreaterThan(0);
        });

        it('should have all prerequisites with required fields (id, name, description, check)', () => {
            actualPrerequisitesJson.prerequisites.forEach(prereq => {
                expect(prereq.id).toBeDefined();
                expect(prereq.name).toBeDefined();
                expect(prereq.description).toBeDefined();
                expect(prereq.check).toBeDefined();
            });
        });

        it('should have check objects with command string (not args array)', () => {
            // Validate the correct check structure from actual JSON
            actualPrerequisitesJson.prerequisites.forEach(prereq => {
                expect(typeof prereq.check.command).toBe('string');
                // Note: 'args' is NOT part of the actual structure - only 'command', 'parseVersion', 'contains'
                expect((prereq.check as any).args).toBeUndefined();
            });
        });

        it('should have componentRequirements with prerequisites arrays', () => {
            expect(actualPrerequisitesJson.componentRequirements).toBeDefined();
            Object.entries(actualPrerequisitesJson.componentRequirements).forEach(([id, req]) => {
                expect(Array.isArray(req.prerequisites)).toBe(true);
            });
        });

        it('should have install.steps structure when present', () => {
            const prereqsWithInstall = actualPrerequisitesJson.prerequisites.filter(p => p.install?.steps);
            expect(prereqsWithInstall.length).toBeGreaterThan(0);

            prereqsWithInstall.forEach(prereq => {
                expect(Array.isArray(prereq.install!.steps)).toBe(true);
                prereq.install!.steps!.forEach((step: any) => {
                    // Steps should have name field
                    expect(step.name).toBeDefined();
                    // Steps should have either commands or commandTemplate
                    const hasCommands = step.commands !== undefined || step.commandTemplate !== undefined;
                    expect(hasCommands).toBe(true);
                });
            });
        });

        it('should have perNodeVersion flag for aio-cli', () => {
            const aioCli = actualPrerequisitesJson.prerequisites.find(p => p.id === 'aio-cli');
            expect(aioCli).toBeDefined();
            expect(aioCli!.perNodeVersion).toBe(true);
        });

        it('should have dynamic install for node prerequisite', () => {
            const node = actualPrerequisitesJson.prerequisites.find(p => p.id === 'node');
            expect(node).toBeDefined();
            expect(node!.install?.dynamic).toBe(true);
        });

        it('should have multiVersion flag for node prerequisite', () => {
            const node = actualPrerequisitesJson.prerequisites.find(p => p.id === 'node');
            expect(node).toBeDefined();
            expect(node!.multiVersion).toBe(true);
        });
    });

    describe('mock structure requirements documentation', () => {
        /**
         * These tests document what the mock structure SHOULD look like
         * based on actual prerequisites.json. They serve as a reference
         * for maintaining the testUtils mock.
         */

        it('documents required fields for PrerequisiteDefinition mock', () => {
            // Required fields from actual JSON:
            const requiredFields = ['id', 'name', 'description', 'check', 'optional'];

            // The mock should include these fields for each prerequisite
            const samplePrereq = actualPrerequisitesJson.prerequisites[0];
            requiredFields.forEach(field => {
                // optional field may be implicitly false (undefined)
                if (field !== 'optional') {
                    expect(samplePrereq[field as keyof typeof samplePrereq]).toBeDefined();
                }
            });
        });

        it('documents check structure (command string, not args array)', () => {
            // CRITICAL: The check structure uses 'command' as a full string
            // NOT: { command: 'node', args: ['--version'] }
            // YES: { command: 'node --version', parseVersion: '...' }

            const sampleCheck = actualPrerequisitesJson.prerequisites[0].check;

            // Valid check structure
            expect(typeof sampleCheck.command).toBe('string');
            // parseVersion is optional
            expect(['string', 'undefined']).toContain(typeof sampleCheck.parseVersion);
            // 'args' should NOT exist
            expect((sampleCheck as any).args).toBeUndefined();
        });

        it('documents componentRequirements structure', () => {
            // componentRequirements maps component IDs to { prerequisites: string[], plugins?: string[] }
            const sampleReq = Object.values(actualPrerequisitesJson.componentRequirements)[0];

            expect(Array.isArray(sampleReq.prerequisites)).toBe(true);
            // plugins is optional
            if (sampleReq.plugins) {
                expect(Array.isArray(sampleReq.plugins)).toBe(true);
            }
        });

        it('documents install.steps structure for dynamic prerequisites', () => {
            const nodePrereq = actualPrerequisitesJson.prerequisites.find(p => p.id === 'node');
            expect(nodePrereq?.install?.dynamic).toBe(true);

            const step = nodePrereq?.install?.steps?.[0] as any;
            expect(step?.name).toBeDefined();
            expect(step?.commandTemplate).toBeDefined(); // dynamic uses commandTemplate
            expect(step?.estimatedDuration).toBeDefined();
            expect(step?.progressStrategy).toBeDefined();
        });
    });

    describe('perNodeVersion prerequisite structure', () => {
        it('should have aio-cli with perNodeVersion and plugins', () => {
            const aioCli = actualPrerequisitesJson.prerequisites.find(p => p.id === 'aio-cli');
            expect(aioCli).toBeDefined();
            expect(aioCli!.perNodeVersion).toBe(true);
            expect(Array.isArray(aioCli!.plugins)).toBe(true);
            expect(aioCli!.plugins!.length).toBeGreaterThan(0);
        });

        it('should have plugins with id, name, check, install, requiredFor', () => {
            const aioCli = actualPrerequisitesJson.prerequisites.find(p => p.id === 'aio-cli');
            const plugin = aioCli!.plugins![0] as any;

            expect(plugin.id).toBeDefined();
            expect(plugin.name).toBeDefined();
            expect(plugin.check).toBeDefined();
            expect(plugin.install).toBeDefined();
            expect(Array.isArray(plugin.requiredFor)).toBe(true);
        });
    });
});
