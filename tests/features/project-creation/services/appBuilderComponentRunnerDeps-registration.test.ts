/**
 * The runner's registry deps, as production wires them: the Console SDK's workspace
 * registry read and unpublish, through the auth service's `extensionPoints` unit, with
 * the project's org and Console project named outright (2026-10-08). What is asserted is
 * the ARGUMENTS the unit is handed: a mock cannot see a malformed call.
 */

import { buildDefaultRunnerDeps } from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import type { RunnerDepsContext } from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import {
    createMockAuthenticationService,
    entityServicesOf,
} from '../../../helpers/authenticationServiceFake';
import { createMockProject } from '../../../helpers/projectFake';

const WS = { id: 'ws-erp', name: 'ERPIntegration' };

function depsWith(authManager: ReturnType<typeof createMockAuthenticationService>) {
    return buildDefaultRunnerDeps({ authManager } as unknown as RunnerDepsContext);
}

const project = createMockProject({ adobe: { organization: 'org-1', projectId: 'proj-1' } });

describe("the runner's registry deps", () => {
    it('reads the workspace\'s published points for the project\'s org and Console project', async () => {
        const authManager = createMockAuthenticationService({}, { entities: { extensionPoints: {
            listWorkspaceExtensionPoints: jest.fn().mockResolvedValue(['commerce/backend-ui/1']),
        } } });

        const result = await depsWith(authManager).workspaceExtensionPointsOf!(project, WS);

        expect(entityServicesOf(authManager).extensionPoints.listWorkspaceExtensionPoints).toHaveBeenCalledWith('ws-erp', { orgId: 'org-1', projectId: 'proj-1' });
        expect(result).toStrictEqual(['commerce/backend-ui/1']);
    });

    it('unpublishes the given points there, and answers what the re-read holds', async () => {
        const authManager = createMockAuthenticationService({}, { entities: { extensionPoints: {
            removeWorkspaceExtensionPoints: jest.fn().mockResolvedValue({ remaining: ['dx/excshell/1'] }),
        } } });

        const result = await depsWith(authManager).removeWorkspaceExtensionPoints!(project, WS, ['commerce/backend-ui/1']);

        expect(entityServicesOf(authManager).extensionPoints.removeWorkspaceExtensionPoints).toHaveBeenCalledWith(
            'ws-erp',
            ['commerce/backend-ui/1'],
            { orgId: 'org-1', projectId: 'proj-1' },
        );
        expect(result).toStrictEqual(['dx/excshell/1']);
    });

    it("hands Adobe's refusal back as the error it is", async () => {
        const authManager = createMockAuthenticationService({}, { entities: { extensionPoints: {
            listWorkspaceExtensionPoints: jest.fn().mockResolvedValue({ error: '403 - Forbidden' }),
            removeWorkspaceExtensionPoints: jest.fn().mockResolvedValue({ error: '403 - Forbidden' }),
        } } });
        const deps = depsWith(authManager);

        await expect(deps.workspaceExtensionPointsOf!(project, WS)).resolves.toEqual({ error: '403 - Forbidden' });
        await expect(deps.removeWorkspaceExtensionPoints!(project, WS, ['x'])).resolves.toEqual({ error: '403 - Forbidden' });
    });
});
