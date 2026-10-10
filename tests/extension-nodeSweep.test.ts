/**
 * The Node sweep's glue: what activation hands `sweepOntoDemoBuilderNode`, how it
 * reinstalls one component, and what the SC is shown afterwards.
 *
 * The decision of what moves lives in `demoBuilderNodeSweep.ts`, with its own
 * suite. What lives in `extension.ts` is the wiring, and it is the one place the
 * sweep's outcome reaches the SC: a status-bar line when it worked, a warning
 * naming anything that could not move, and nothing at all when nothing was needed.
 */

import {
    activate,
    deactivate,
    vscode,
    createActivationContext,
    mockHasProject,
    mockGetCurrentProject,
    mockGetAllProjects,
    mockLoadProjectFromPath,
    mockSaveProjectConfigOnly,
    mockSweepCommerceSecrets,
    mockSweepManifestFormat,
    mockSweepOntoDemoBuilderNode,
    NODE_SWEEP_NOT_NEEDED,
} from './extension.testUtils';
import { demoBuilderNode } from '@/core/shell/demoBuilderNode';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { ComponentManager } from '@/features/components/services/componentManager';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import type { NodeSweepDeps } from '@/features/components/services/demoBuilderNodeSweep';
import type { ComponentInstance } from '@/types/base';
import type { TransformedComponentDefinition } from '@/types/components';

const NODE = demoBuilderNode();
const MESH: ComponentInstance = {
    id: 'commerce-mesh',
    name: 'API Mesh',
    status: 'ready',
    path: '/projects/demo-a/mesh',
};
const MESH_DEFINITION: TransformedComponentDefinition = { id: 'commerce-mesh', name: 'API Mesh' };

/** Let the detached upkeep chain reach its last link, the Node sweep. */
async function settleSweeps(): Promise<void> {
    for (let i = 0; i < 40 && mockSweepOntoDemoBuilderNode.mock.calls.length === 0; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    // One more turn, for what the glue does with the sweep's answer.
    await new Promise((resolve) => setImmediate(resolve));
}

/** Activate, wait for the sweep, and hand back what it was given. */
async function sweepDeps(): Promise<NodeSweepDeps> {
    await activate(createActivationContext());
    await settleSweeps();
    return mockSweepOntoDemoBuilderNode.mock.calls[0][0];
}

// Every test runs the whole upkeep chain, as in extension-activationSweeps.
jest.setTimeout(20_000);

describe('the Node sweep activation runs', () => {
    // Spied per test: the jest config restores spies between tests.
    let install: jest.SpiedFunction<ComponentManager['installNpmDependencies']>;
    let lookUp: jest.SpiedFunction<ComponentRegistryManager['getComponentById']>;

    afterEach(() => {
        deactivate();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockHasProject.mockResolvedValue(false);
        mockGetCurrentProject.mockResolvedValue(undefined);
        (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted = true;
        (vscode.workspace as unknown as { workspaceFolders?: unknown }).workspaceFolders =
            undefined;
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, fallback: unknown) => fallback),
        });
        mockGetAllProjects.mockResolvedValue([{ name: 'demo-a', path: '/projects/demo-a' }]);
        mockLoadProjectFromPath.mockImplementation(async (p: string) => ({ name: p, path: p }));
        mockSweepCommerceSecrets.mockResolvedValue(undefined);
        mockSweepManifestFormat.mockResolvedValue(undefined);
        mockSweepOntoDemoBuilderNode.mockResolvedValue(NODE_SWEEP_NOT_NEEDED);
        install = jest
            .spyOn(ComponentManager.prototype, 'installNpmDependencies')
            .mockResolvedValue({ success: true });
        lookUp = jest
            .spyOn(ComponentRegistryManager.prototype, 'getComponentById')
            .mockResolvedValue(MESH_DEFINITION);
    });

    describe('what the sweep is handed', () => {
        it("gets every project and Demo Builder's own Node", async () => {
            const deps = await sweepDeps();

            expect(deps.projects.map((p) => p.path)).toStrictEqual(['/projects/demo-a']);
            expect(deps.node).toBe(NODE);
        });

        // The default load path also moves currentProject and the recents list,
        // once for every project the sweep reads.
        it('loads the projects without moving the current-project pointer', async () => {
            await sweepDeps();

            expect(mockLoadProjectFromPath).toHaveBeenCalledWith('/projects/demo-a', undefined, {
                persistAfterLoad: false,
            });
        });

        it('saves a moved project config-only', async () => {
            const deps = await sweepDeps();
            const project = deps.projects[0];

            await deps.saveProject(project);

            expect(mockSaveProjectConfigOnly).toHaveBeenCalledWith(project);
        });
    });

    describe('reinstalling one component', () => {
        it("installs the catalog's definition into the component's folder, on the Node asked for", async () => {
            const deps = await sweepDeps();

            const error = await deps.reinstall('commerce-mesh', MESH, '24');

            expect(lookUp).toHaveBeenCalledWith('commerce-mesh');
            expect(install).toHaveBeenCalledWith('/projects/demo-a/mesh', MESH_DEFINITION, '24');
            expect(error).toBeUndefined();
        });

        // An App Builder component is not in the catalog: it needs only its packages.
        it('installs a bare definition for a component the catalog does not define', async () => {
            lookUp.mockResolvedValue(undefined);
            const deps = await sweepDeps();

            await deps.reinstall('erp-sync', { ...MESH, id: 'erp-sync', name: 'ERP Sync' }, '24');

            expect(install).toHaveBeenCalledWith(
                '/projects/demo-a/mesh',
                { id: 'erp-sync', name: 'ERP Sync', type: 'app-builder' },
                '24'
            );
        });

        it('says so, and installs nothing, when the component has no folder on disk', async () => {
            const deps = await sweepDeps();

            const error = await deps.reinstall('commerce-mesh', { ...MESH, path: undefined }, '24');

            expect(error).toBe('it has no folder on disk');
            expect(install).not.toHaveBeenCalled();
        });

        it("answers the installer's own reason when the reinstall fails", async () => {
            install.mockResolvedValue({ success: false, error: 'npm ERR! EACCES' });
            const deps = await sweepDeps();

            expect(await deps.reinstall('commerce-mesh', MESH, '24')).toBe('npm ERR! EACCES');
        });

        it('answers a plain reason when the installer gave none', async () => {
            install.mockResolvedValue({ success: false });
            const deps = await sweepDeps();

            expect(await deps.reinstall('commerce-mesh', MESH, '24')).toBe('the reinstall failed');
        });
    });

    describe('what the SC is shown afterwards', () => {
        it('shows nothing when nothing was needed', async () => {
            await sweepDeps();

            expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalled();
            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        });

        it('says which Node it now runs on, and warns of nothing, when everything moved', async () => {
            mockSweepOntoDemoBuilderNode.mockResolvedValue({
                ran: true,
                moved: ['commerce-mesh'],
                failed: [],
                running: [],
            });

            await sweepDeps();

            expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
                `$(check) Demo Builder now runs on Node ${NODE}`,
                TIMEOUTS.STATUS_BAR_SUCCESS
            );
            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        });

        it('warns, and claims no move, when the Node could not be prepared', async () => {
            mockSweepOntoDemoBuilderNode.mockResolvedValue({
                ...NODE_SWEEP_NOT_NEEDED,
                ran: true,
                nodeError: 'download failed',
            });

            await sweepDeps();

            expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining(`could not prepare Node ${NODE}`)
            );
            expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalled();
        });

        it('names each component that could not move', async () => {
            mockSweepOntoDemoBuilderNode.mockResolvedValue({
                ran: true,
                moved: [],
                failed: [
                    { component: 'API Mesh', error: 'npm failed' },
                    { component: 'ERP Sync', error: 'npm failed' },
                ],
                running: [],
            });

            await sweepDeps();

            expect(vscode.window.setStatusBarMessage).toHaveBeenCalledTimes(1);
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining(`Could not move API Mesh, ERP Sync to Node ${NODE}`)
            );
        });

        // A sweep that cannot run costs the sweep and nothing else.
        it('shows nothing, and does not fail activation, when the sweep throws', async () => {
            mockSweepOntoDemoBuilderNode.mockRejectedValue(new Error('registry unreadable'));

            await sweepDeps();

            expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalled();
            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });
    });
});
