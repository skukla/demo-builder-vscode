/**
 * enabledApisFromSelection tests — the project-level "already enabled" derivation.
 *
 * API access is project-level: the deploy subscribes the UNION of every
 * integration's `requiredApis` plus the shared baseline. So the APIs already
 * covered by the integrations ALREADY in the project = the baseline (once any
 * integration exists) + each existing integration's requiredApis. The Add
 * Integration flow uses this to show already-covered APIs as ✓ instead of pending.
 *
 * @jest-environment node
 */

const mockGetAvailable = jest.fn();
jest.mock('@/features/project-creation/services/appBuilderComponentCatalogLoader', () => ({
    getAvailableAppBuilderComponents: (...args: unknown[]) => mockGetAvailable(...args),
}));

import { enabledApisFromSelection } from '@/features/project-creation/ui/components/integration-flow/enabledApis';

const MESH = 'GraphQLServiceSDK';
const BASELINE = 'AdobeIOManagementAPISDK';

beforeEach(() => {
    mockGetAvailable.mockReset();
    mockGetAvailable.mockReturnValue([
        { id: 'headless-commerce-mesh', kind: 'mesh', requiredApis: [MESH] },
        { id: 'erp-sync', kind: 'integration', requiredApis: ['ERPSDK'] },
        { id: 'app-builder-shell', kind: 'integration' }, // blank shell: no requiredApis
    ]);
});

describe('enabledApisFromSelection', () => {
    it('returns nothing when no integration is in the project yet', () => {
        expect(enabledApisFromSelection([], 'backend', 'frontend')).toEqual([]);
        // No catalog lookup needed when the selection is empty.
        expect(mockGetAvailable).not.toHaveBeenCalled();
    });

    it("covers the baseline plus a selected mesh's required APIs", () => {
        const result = enabledApisFromSelection(['headless-commerce-mesh'], 'b', 'f');
        // The mesh covers API Mesh; any integration also covers the shared baseline.
        expect(result).toContain(MESH);
        expect(result).toContain(BASELINE);
        expect(result).not.toContain('ERPSDK');
    });

    it('unions the required APIs across multiple selected integrations', () => {
        const result = enabledApisFromSelection(['headless-commerce-mesh', 'erp-sync'], 'b', 'f');
        expect(result).toEqual(expect.arrayContaining([MESH, 'ERPSDK', BASELINE]));
    });

    it('covers just the baseline for a selected integration that declares no APIs', () => {
        // A blank/custom app declares none up front — but its presence still means
        // the project has enabled the baseline.
        expect(enabledApisFromSelection(['app-builder-shell'], 'b', 'f')).toEqual([BASELINE]);
    });

    it('passes the stack ids through to the catalog loader (empty string when absent)', () => {
        enabledApisFromSelection(['erp-sync'], undefined, undefined);
        expect(mockGetAvailable).toHaveBeenCalledWith('', '');
    });
});
