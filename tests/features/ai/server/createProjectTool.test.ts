/**
 * create_project tests — validation, EDS gate, mesh auth handoff, and the
 * happy path (assemble via buildProjectConfig → executeProjectCreation with
 * skipWorkspaceAnchor). The heavy creation deps are mocked.
 */

jest.mock('@/features/project-creation/handlers/executor', () => ({
    executeProjectCreation: jest.fn(async () => undefined),
}));
jest.mock('@/features/project-creation/ui/wizard/wizardHelpers', () => ({
    buildProjectConfig: jest.fn(() => ({ projectName: 'assembled' })),
}));
jest.mock('@/features/project-creation/services/demoPackageLoader', () => ({
    loadDemoPackages: jest.fn(async () => [{ id: 'citisignal', storefronts: { 'headless-paas': {} } }]),
    getStorefrontForStack: jest.fn(async () => ({ source: {} })),
    getAvailableStacksForPackage: jest.fn(async () => ['headless-paas']),
    getAutoSelectedOptionalDependencies: jest.fn(async () => []),
    getResolvedMeshRequirement: jest.fn(() => false),
}));

import { registerCreateProjectTool } from '@/features/ai/server/createProjectTool';
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';
import { buildProjectConfig } from '@/features/project-creation/ui/wizard/wizardHelpers';
import {
    getResolvedMeshRequirement,
    getStorefrontForStack,
} from '@/features/project-creation/services/demoPackageLoader';
import type { HandlerContext } from '@/types/handlers';

function fakeServer() {
     
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {
         
        registerTool(name: string, _def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
        },
         
        async call(args?: unknown): Promise<any> {
            return JSON.parse((await tools.get('create_project')!(args)).content[0].text);
        },
    };
}

const authManager = {
    isAuthenticated: jest.fn(async () => true),
    getCurrentOrganization: jest.fn(async () => ({ id: 'org-1', name: 'Org' })),
    getCurrentProject: jest.fn(async () => ({ id: 'proj-1', name: 'Proj' })),
    getCurrentWorkspace: jest.fn(async () => ({ id: 'ws-1', name: 'Stage' })),
};
const ctxFactory = () => ({ authManager }) as unknown as HandlerContext;

const ARGS = { projectName: 'my-proj', package: 'citisignal', stack: 'headless-paas', confirm: true };

describe('create_project', () => {
    beforeEach(() => jest.clearAllMocks());

    it('requires confirm:true', async () => {
        const s = fakeServer();
        registerCreateProjectTool(s, ctxFactory);
        const res = await s.call({ ...ARGS, confirm: false });
        expect(res.error).toMatch(/requires confirm:true/);
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('gates EDS stacks for now', async () => {
        const s = fakeServer();
        registerCreateProjectTool(s, ctxFactory);
        const res = await s.call({ ...ARGS, stack: 'eds-paas' });
        expect(res.error).toMatch(/EDS project creation/i);
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('rejects an invalid (package, stack) pair with the valid stacks', async () => {
        (getStorefrontForStack as jest.Mock).mockResolvedValueOnce(undefined);
        const s = fakeServer();
        registerCreateProjectTool(s, ctxFactory);
        const res = await s.call({ ...ARGS, stack: 'headless-accs' });
        expect(res.validStacksForPackage).toEqual(['headless-paas']);
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('creates a non-mesh project: assembles config and skips the workspace anchor', async () => {
        const s = fakeServer();
        registerCreateProjectTool(s, ctxFactory);
        const res = await s.call(ARGS);

        expect(buildProjectConfig).toHaveBeenCalled();
        expect(executeProjectCreation).toHaveBeenCalledWith(
            expect.anything(),
            { projectName: 'assembled' },
            { skipWorkspaceAnchor: true },
        );
        expect(res).toMatchObject({ created: true, name: 'my-proj' });
        expect(res.path).toMatch(/my-proj$/);
    });

    it('mesh project returns a needsAuth handoff when not signed in', async () => {
        (getResolvedMeshRequirement as jest.Mock).mockReturnValueOnce(true);
        authManager.isAuthenticated.mockResolvedValueOnce(false);
        const s = fakeServer();
        registerCreateProjectTool(s, ctxFactory);
        const res = await s.call(ARGS);
        expect(res).toMatchObject({ needsAuth: 'adobe' });
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('mesh project requires a selected workspace', async () => {
        (getResolvedMeshRequirement as jest.Mock).mockReturnValueOnce(true);
        authManager.getCurrentWorkspace.mockResolvedValueOnce(undefined);
        const s = fakeServer();
        registerCreateProjectTool(s, ctxFactory);
        const res = await s.call(ARGS);
        expect(res.error).toMatch(/workspace/i);
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });
});
