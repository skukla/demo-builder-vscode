/**
 * projectResetService — the "leave integrations alone" rule at its edges.
 *
 * AB-23 slice 7 (owner, 2026-09-21): a reset never touches an integration. The
 * rule has three decisions, and the PL-69 sitting 9 re-measure (2026-10-09) found
 * none of them under test: a mesh app is NOT an integration, a kept folder is named
 * by its instance path, and a kept integration may have no instance record at all.
 * Each is pinned by what reaches `fs.rm` and the orchestrator.
 */

import {
    createResetProject,
    handedDefinitions,
    installResetDefaults,
    mockReaddir,
    mockRm,
    run,
} from './projectResetService-resetWithUI.testUtils';

const ERP_INTEGRATION = {
    kind: 'integration' as const,
    status: 'deployed' as const,
    source: { owner: 'o', repo: 'r' },
};
const citisignal = () => ({
    id: 'citisignal',
    name: 'CitiSignal',
    status: 'ready' as const,
    path: '/projects/demo/components/citisignal',
});

beforeEach(installResetDefaults);

describe('resetProjectWithUI — which folders a reset keeps', () => {
    it('a mesh app is NOT an integration: its folder goes and it is rebuilt', async () => {
        const project = createResetProject({
            appBuilderComponents: {
                'commerce-mesh': { kind: 'mesh', status: 'deployed', source: { owner: 'o', repo: 'r' } },
            },
            componentInstances: {
                citisignal: citisignal(),
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'Mesh',
                    status: 'ready',
                    path: '/projects/demo/components/commerce-mesh',
                },
            },
        });
        mockReaddir.mockResolvedValue(['citisignal', 'commerce-mesh']);

        await run(project);

        expect(Object.keys(handedDefinitions())).toEqual(['citisignal', 'commerce-mesh']);
        expect(mockRm).toHaveBeenCalledWith('/projects/demo/components', { recursive: true, force: true });
        expect(mockReaddir).not.toHaveBeenCalled();
    });

    it('keeps an integration folder by its instance PATH, not by its id', async () => {
        const project = createResetProject({
            componentSelections: { dependencies: [], appBuilder: [] },
            appBuilderComponents: { 'erp-integration': ERP_INTEGRATION },
            componentInstances: {
                citisignal: citisignal(),
                'erp-integration': {
                    id: 'erp-integration',
                    name: 'ERP',
                    status: 'ready',
                    path: '/projects/demo/components/erp-folder',
                },
            },
        });
        mockReaddir.mockResolvedValue(['citisignal', 'erp-folder', 'erp-integration']);

        await run(project);

        expect(mockRm.mock.calls).toEqual([
            ['/projects/demo/components/citisignal', { recursive: true, force: true }],
            ['/projects/demo/components/erp-integration', { recursive: true, force: true }],
        ]);
    });

    it('keeps an integration folder by its id when the project has no instance records at all', async () => {
        const project = createResetProject({
            componentSelections: { dependencies: [], appBuilder: [] },
            appBuilderComponents: { 'erp-integration': ERP_INTEGRATION },
            componentInstances: undefined,
        });
        mockReaddir.mockResolvedValue(['citisignal', 'erp-integration']);

        await expect(run(project)).resolves.toEqual(expect.objectContaining({ success: true }));

        expect(mockRm.mock.calls).toEqual([
            ['/projects/demo/components/citisignal', { recursive: true, force: true }],
        ]);
    });

    it('keeps an integration folder by its id when only ITS instance record is missing', async () => {
        const project = createResetProject({
            componentSelections: { dependencies: [], appBuilder: [] },
            appBuilderComponents: { 'erp-integration': ERP_INTEGRATION },
            componentInstances: { citisignal: citisignal() },
        });
        mockReaddir.mockResolvedValue(['citisignal', 'erp-integration']);

        await expect(run(project)).resolves.toEqual(expect.objectContaining({ success: true }));

        expect(mockRm.mock.calls).toEqual([
            ['/projects/demo/components/citisignal', { recursive: true, force: true }],
        ]);
    });
});
