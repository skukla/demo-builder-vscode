/**
 * The dashboard add door replaces the pair another local project deployed into the
 * same Adobe project under the same ERP name, before it deploys (owner, 2026-10-08).
 * The agent's `add_integration` dispatches into this same handler.
 */

import {
    ERP_ENTRY,
    handleAddAppBuilderComponent,
    mockAddAppBuilderComponent,
    mockGetAppBuilderComponentCatalog,
    mockGetAppBuilderComponentEntry,
    mockRemoveAppBuilderComponent,
    mockTestDeveloperPermissions,
    resetHandlerMocks,
    setupMocks,
} from './appBuilderComponentHandlers.testUtils';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const INTEGRATION: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP Integration',
    description: 'the integration',
    kind: 'integration',
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};
const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    nameFromEnvVar: 'ERP_DISPLAY_NAME',
    envSchema: [{ name: 'ERP_DISPLAY_NAME', label: 'ERP name', type: 'text', default: 'Acme ERP' }],
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};

function state(kind: AppBuilderComponentState['kind'], name: string, extra: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState {
    return { kind, name, status: 'deployed', source: { owner: 'skukla', repo: 'x' }, ...extra };
}

/** Another local project holding the pair in the fixture's Adobe project (`project123`). */
function otherPair(erpName: string, adobeProjectId = 'project123'): Project {
    return createMockProject({
        name: 'justrite',
        path: '/projects/justrite',
        adobe: { projectId: adobeProjectId, organization: 'org123' },
        appBuilderComponents: {
            'erp-integration': state('integration', 'ERP Integration', { systems: ['demo-erp'] }),
            'demo-erp': state('system', erpName, { usedBy: 'erp-integration' }),
        },
    });
}

function setup(other?: Project) {
    const mocks = setupMocks({ appBuilderComponents: {} });
    mockTestDeveloperPermissions(true);
    mockGetAppBuilderComponentEntry.mockReturnValue(INTEGRATION);
    mockGetAppBuilderComponentCatalog.mockReturnValue([INTEGRATION, SYSTEM]);
    const stateManager = mocks.mockContext.stateManager as unknown as { getAllProjects: jest.Mock; loadProjectFromPath: jest.Mock };
    stateManager.getAllProjects = jest.fn().mockResolvedValue(other ? [{ name: other.name, path: other.path, lastModified: new Date() }] : []);
    stateManager.loadProjectFromPath = jest.fn().mockResolvedValue(other ?? null);
    return mocks;
}

/** The order the removal and the add ran in. */
function ranInOrder(): string[] {
    const calls = [
        ...mockRemoveAppBuilderComponent.mock.invocationCallOrder.map((n) => [n, 'remove'] as const),
        ...mockAddAppBuilderComponent.mock.invocationCallOrder.map((n) => [n, 'add'] as const),
    ];
    return calls.sort((a, b) => a[0] - b[0]).map(([, name]) => name);
}

beforeEach(() => {
    resetHandlerMocks();
});

describe('handleAddAppBuilderComponent — one Adobe project holds one ERP of a name', () => {
    it('removes the other project\'s pair first when its ERP has the name this one will', async () => {
        const other = otherPair('Justrite ERP');
        const { mockContext, mockProject } = setup(other);

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-integration', name: 'Justrite' });

        expect(result.success).toBe(true);
        expect(mockRemoveAppBuilderComponent).toHaveBeenCalledWith(other, 'erp-integration', expect.anything());
        expect(mockAddAppBuilderComponent).toHaveBeenCalledWith(mockProject, INTEGRATION, expect.anything());
        expect(ranInOrder()).toStrictEqual(['remove', 'add']);
    });

    it('stops before deploying, with the reason, when that removal did not finish', async () => {
        const { mockContext } = setup(otherPair('Justrite ERP'));
        mockRemoveAppBuilderComponent.mockResolvedValue({ success: false, error: 'Nothing was removed. Commerce still has it.' });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-integration', name: 'Justrite' });

        expect(result.success).toBe(false);
        expect(result.error).toContain("justrite's Justrite ERP is still deployed");
        expect(result.error).toContain('Nothing was removed. Commerce still has it.');
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('adds beside a pair whose ERP has a different name', async () => {
        const { mockContext } = setup(otherPair('Acme ERP'));

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-integration', name: 'Justrite' });

        expect(result.success).toBe(true);
        expect(mockRemoveAppBuilderComponent).not.toHaveBeenCalled();
        expect(mockAddAppBuilderComponent).toHaveBeenCalledTimes(1);
    });

    it('leaves a same-named pair in a different Adobe project alone', async () => {
        const { mockContext } = setup(otherPair('Justrite ERP', 'another-adobe-project'));

        await handleAddAppBuilderComponent(mockContext, { id: 'erp-integration', name: 'Justrite' });

        expect(mockRemoveAppBuilderComponent).not.toHaveBeenCalled();
        expect(mockAddAppBuilderComponent).toHaveBeenCalledTimes(1);
    });

    it('removes nothing when no other project exists', async () => {
        const { mockContext } = setup();
        mockGetAppBuilderComponentEntry.mockReturnValue(ERP_ENTRY);

        await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockRemoveAppBuilderComponent).not.toHaveBeenCalled();
        expect(mockAddAppBuilderComponent).toHaveBeenCalledTimes(1);
    });
});
