/**
 * Shared setup for the checkHandler suites.
 *
 * Plain factory functions only — no `jest.mock` calls. Module mocks must be
 * declared in the suite that needs them so hoisting puts them ahead of the
 * import of the module under test.
 */

import * as vscode from 'vscode';
import type { HandlerContext } from '@/types/handlers';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';

/** The workspace `getCurrentProject` reports unless a test overrides it. */
export const PROJECT_ADOBE = {
    organization: 'test-org-id',
    projectId: 'test-project-id',
    workspace: 'project-workspace-id',
};

/** The apiMesh detection config the handler reads off `sharedState`. */
export const API_SERVICES_CONFIG = {
    services: {
        apiMesh: {
            detection: {
                namePatterns: ['API Mesh'],
                codes: ['MeshAPI'],
                codeNames: ['MeshAPI'],
            },
        },
    },
};

/** A workspace-config download payload whose services list is `services`. */
export function workspaceConfigJson(services: unknown[]): string {
    return JSON.stringify({ project: { workspace: { details: { services } } } });
}

/** The one service entry that makes `checkApiMeshEnabled` say enabled. */
export const MESH_SERVICE = { name: 'API Mesh', code: 'MeshAPI' };

/** The ServiceLocator doubles the handler fetches at its boundary. */
export function createMeshServiceDoubles() {
    return {
        authService: {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
        },
        commandExecutor: {
            execute: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
        },
    };
}

/** A HandlerContext wired for the mesh check: real logger fakes, mesh detection config. */
export function createMeshCheckContext(
    overrides: Partial<HandlerContext> = {},
): jest.Mocked<HandlerContext> {
    return createMockHandlerContext({
        context: createMockExtensionContext({
            globalStorageUri: vscode.Uri.file('/tmp/test-storage'),
        }),
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue({ adobe: PROJECT_ADOBE }),
        }),
        authManager: createMockAuthenticationService(),
        sharedState: {
            isAuthenticating: false,
            apiServicesConfig: API_SERVICES_CONFIG,
        },
        ...overrides,
    });
}
