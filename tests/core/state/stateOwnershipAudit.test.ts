/**
 * State Ownership Audit Validation Tests
 *
 * These tests validate the state ownership documentation created as part of
 * the Over-Engineering Remediation (Step 1). They ensure:
 * 1. The state ownership document exists
 * 2. All Project fields are documented with clear ownership
 * 3. The single-source-of-truth principle is established
 *
 * Test Strategy:
 * - File existence verification
 * - Content validation for required sections
 * - Field coverage completeness check
 */

import * as fs from 'fs';
import * as path from 'path';

const DOCS_PATH = path.join(__dirname, '../../../docs/architecture/state-ownership.md');

/**
 * Shared document content - loaded once for all tests
 * This prevents redundant file reads across describe blocks
 */
let sharedDocumentContent: string;

beforeAll(() => {
    try {
        sharedDocumentContent = fs.readFileSync(DOCS_PATH, 'utf-8');
    } catch {
        sharedDocumentContent = '';
    }
});

describe('State Ownership Audit - Documentation Completeness', () => {
    describe('Document Existence', () => {
        it('should have state-ownership.md in docs/architecture/', () => {
            // Given: The project has a docs/architecture directory
            // When: We check for state-ownership.md
            // Then: The file should exist
            const exists = fs.existsSync(DOCS_PATH);
            expect(exists).toBe(true);
        });

        it('should have non-empty content', () => {
            // Given: The state-ownership.md file exists
            // When: We read its content
            // Then: It should not be empty
            expect(sharedDocumentContent.length).toBeGreaterThan(100);
        });
    });

    describe('Required Sections', () => {
        it('should document the single-source-of-truth principle', () => {
            // Given: The state ownership document
            // When: We search for the principle section
            // Then: It should exist with clear explanation
            expect(sharedDocumentContent).toMatch(/single[- ]source[- ]of[- ]truth/i);
        });

        it('should document componentInstances field ownership', () => {
            // Given: The state ownership document
            // When: We search for componentInstances documentation
            // Then: It should be clearly documented
            expect(sharedDocumentContent).toContain('componentInstances');
        });

        it('should document componentConfigs field ownership', () => {
            // Given: The state ownership document
            // When: We search for componentConfigs documentation
            // Then: It should be clearly documented
            expect(sharedDocumentContent).toContain('componentConfigs');
        });

        it('should document meshState field ownership', () => {
            // Given: The state ownership document
            // When: We search for meshState documentation
            // Then: It should be clearly documented
            expect(sharedDocumentContent).toContain('meshState');
        });

        it('should document frontendEnvState field ownership', () => {
            // Given: The state ownership document
            // When: We search for frontendEnvState documentation
            // Then: It should be clearly documented
            expect(sharedDocumentContent).toContain('frontendEnvState');
        });
    });

    describe('Field Ownership Mapping', () => {
        it('should clearly define what componentInstances stores', () => {
            // Given: The componentInstances documentation
            // When: We check for purpose definition
            // Then: It should explain runtime state (status, pid, port)
            expect(sharedDocumentContent).toMatch(/componentInstances.*(?:runtime|status|pid|port)/is);
        });

        it('should clearly define what componentConfigs stores', () => {
            // Given: The componentConfigs documentation
            // When: We check for purpose definition
            // Then: It should explain configuration/env vars
            expect(sharedDocumentContent).toMatch(/componentConfigs.*(?:configuration|environment|env.*var)/is);
        });

        it('should document the mesh endpoint authoritative location', () => {
            // Given: The state ownership document (after mesh endpoint fix)
            // When: We search for mesh endpoint ownership
            // Then: Only one authoritative location should be documented
            // This validates the fix from the mesh endpoint dual-storage bug
            const meshEndpointMatches = sharedDocumentContent.match(/mesh.*endpoint|endpoint.*mesh/gi) || [];
            expect(meshEndpointMatches.length).toBeGreaterThan(0);
            expect(sharedDocumentContent).toMatch(/meshState.*authoritative|authoritative.*meshState/is);
        });
    });

    describe('Write Authority Documentation', () => {
        it('should document which modules can write to componentInstances', () => {
            // Given: The state ownership document
            // When: We search for write authority
            // Then: It should specify which modules have write access
            expect(sharedDocumentContent).toMatch(/write.*componentInstances|componentInstances.*write/is);
        });

        it('should document which modules can write to componentConfigs', () => {
            // Given: The state ownership document
            // When: We search for write authority
            // Then: It should specify which modules have write access
            expect(sharedDocumentContent).toMatch(/write.*componentConfigs|componentConfigs.*write/is);
        });
    });

    describe('Remediation Items', () => {
        it('should include a remediation section or findings', () => {
            // Given: The audit was performed
            // When: We search for remediation/findings
            // Then: There should be actionable items or findings documented
            expect(sharedDocumentContent).toMatch(/remediation|findings|action.*items|violations/i);
        });
    });
});

describe('State Ownership Audit - No Duplicate Writes Pattern', () => {
    /**
     * This test validates the audit findings for duplicate write patterns.
     * Based on the over-engineering analysis, the mesh endpoint bug revealed
     * that data was being written to multiple locations. This test ensures
     * the audit documents any remaining duplicate write patterns.
     */

    it('should document the resolved mesh endpoint dual-storage issue', () => {
        // Given: The mesh endpoint fix was implemented
        // When: We check the audit documentation
        // Then: It should reference the fix and new single-source pattern
        expect(sharedDocumentContent).toMatch(/mesh.*endpoint.*(?:fix|resolved|single|removed)/is);
    });

    it('should indicate whether other duplicate patterns exist', () => {
        // Given: The audit was performed on componentInstances/componentConfigs
        // When: We check for overlap documentation
        // Then: It should indicate if overlaps exist and remediation status
        expect(sharedDocumentContent).toMatch(/overlap|duplicate|redundant/i);
    });
});

describe('State Ownership Audit - Mesh Endpoint Single Source Verification', () => {
    /**
     * This test validates that the mesh endpoint now has a single authoritative
     * source, as documented in the state ownership audit.
     */

    it('should identify meshState as the authoritative source for mesh endpoint', () => {
        // Given: The mesh endpoint fix uses meshState as single source
        // When: We check the audit documentation
        // Then: meshState should be identified as authoritative
        expect(sharedDocumentContent).toMatch(/meshState/);
        expect(sharedDocumentContent).toMatch(/authoritative|single.*source|only.*location/i);
    });

    it('should document removal of duplicate mesh endpoint storage', () => {
        // Given: The fix removed duplicate storage in componentInstances.endpoint
        // When: We check the audit
        // Then: It should document what was removed
        expect(sharedDocumentContent).toMatch(/removed|deprecated|no.*longer/i);
    });
});
