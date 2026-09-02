/**
 * Shared setup for the contentAuthoringTools suites.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import those
 * from HERE and declare no jest.mock of their own — jest.mock hoists above the
 * imports of the module it appears in, NOT across modules, so an import left
 * behind in a spec loads the real module before these mocks register.
 *
 * Extracted 2026-08-30 (lane C1) from byte-identical copies in:
 *   contentAuthoringTools-sizes.test.ts
 *   contentAuthoringTools.test.ts
 */

import { registerContentAuthoringTools } from '@/features/ai/server/contentAuthoringTools';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { DaLiveContentOperations } from '@/features/eds/services/daLive/daLiveContentOperations';
import type { HelixService } from '@/features/eds/services/helix/helixService';
import { isEdsProject } from '@/types/typeGuards';

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(),
    getDaLiveAuthService: jest.fn(),
}));
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn(),
    createDaLiveServiceTokenProvider: jest.fn(() => ({ getAccessToken: async () => 'da-token' })),
}));
jest.mock('@/types/typeGuards', () => ({
    ...jest.requireActual('@/types/typeGuards'),
    isEdsProject: jest.fn(),
}));
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    getAdobeTarget: jest.fn(() => ({ orgId: 'org-stored' })),
    runWithAdobeTarget: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));
const getGitHubServicesMock = getGitHubServices as jest.Mock;
const getDaLiveAuthServiceMock = getDaLiveAuthService as jest.Mock;
const isEdsProjectMock = isEdsProject as unknown as jest.Mock;
const DaLiveContentOperationsMock = DaLiveContentOperations as unknown as jest.Mock;
/**
 * The Helix FACTORY the specs hand to `registerContentAuthoringTools`, replacing the
 * module mock that existed only to intercept the constructor (ADR-016 mock wall).
 *
 * Kept named `HelixServiceMock` so the two specs read unchanged: they still call
 * `.mockImplementation(() => helix)`, which now supplies the factory's return rather
 * than the constructor's. Same expressive power, no module interception.
 */
const HelixServiceMock = jest.fn() as jest.Mock<HelixService, [unknown]>;
const getCurrentProject = jest.fn();

export { registerContentAuthoringTools };
export { getDaLiveAuthService, getGitHubServices };
export { DaLiveContentOperations };
export type { HelixService };
export { isEdsProject };

export {
    DaLiveContentOperationsMock,
    HelixServiceMock,
    getCurrentProject,
    getDaLiveAuthServiceMock,
    getGitHubServicesMock,
    isEdsProjectMock,
};

/**
 * Minimal MCP server double: capture handlers, invoke by name, parse the JSON back.
 *
 * Both suites in this family had their own identical copy. It lives here now — a
 * tool suite's whole interface with the server is "register, then call", and one
 * definition of that is enough.
 */
export function fakeServer(): {
    registerTool(
        name: string,
        def: unknown,
        handler: (args: unknown) => Promise<{ content: Array<{ text: string }> }>
    ): void;
    names(): string[];
    call<T = Record<string, unknown>>(name: string, args?: unknown): Promise<T>;
} {
    const tools = new Map<
        string,
        (args: unknown) => Promise<{ content: Array<{ text: string }> }>
    >();
    return {
        registerTool(name, _def, handler) {
            tools.set(name, handler);
        },
        names: () => [...tools.keys()],
        async call<T = Record<string, unknown>>(name: string, args: unknown = {}): Promise<T> {
            const handler = tools.get(name);
            if (!handler) {
                throw new Error(`no tool registered as "${name}" — registered: ${[...tools.keys()]}`);
            }
            return JSON.parse((await handler(args)).content[0].text) as T;
        },
    };
}

import { COMPONENT_IDS } from '@/core/constants';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

/**
 * The project these tools run against.
 *
 * `selectedStack` MUST start with "eds-": the module uses the shared
 * getEdsRepoParts/getEdsDaLiveTarget getters, whose INTERNAL isEdsProject call
 * resolves to the real implementation even though the SUT's own call is mocked.
 * Mocking the getters instead would stop testing the coordinate extraction.
 */
export const EDS_PROJECT = {
    name: 'bodea',
    path: '/p/bodea',
    selectedStack: 'eds-commerce',
    componentInstances: {
        [COMPONENT_IDS.EDS_STOREFRONT]: {
            metadata: { githubRepo: 'skukla/bodea', daLiveOrg: 'skukla', daLiveSite: 'bodea' },
        },
    },
};

/** A handler context carrying the project above. */
export const ctxFactory = () =>
    createMockHandlerContext({
        stateManager: createMockStateManager({ getCurrentProject }),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
        logger: createMockLogger(),
    });

export interface DaLiveOpsDouble {
    listDirectory: jest.Mock;
    createSource: jest.Mock;
    deleteSource: jest.Mock;
    readSource: jest.Mock;
}

export interface HelixDouble {
    previewAndPublishPage: jest.Mock;
    unpublishPage: jest.Mock;
}

/** A fetch `Response` shaped as far as these tools read it. */
export const okResponse = (body: string, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => body,
});

/** A server with the content-authoring tools registered on it. */
export function register(): ReturnType<typeof fakeServer> {
    const s = fakeServer();
    registerContentAuthoringTools(s, ctxFactory, HelixServiceMock);
    return s;
}

export interface ContentAuthoringDoubles {
    daOps: DaLiveOpsDouble;
    helix: HelixDouble;
    fetchMock: jest.Mock;
}

/**
 * Every collaborator answering successfully, so a test overrides only the one it
 * is about. Both suites built this identically — 60 lines each.
 */
export function setupContentAuthoring(): ContentAuthoringDoubles {
    getCurrentProject.mockResolvedValue(EDS_PROJECT);
    isEdsProjectMock.mockReturnValue(true);
    getGitHubServicesMock.mockReturnValue({
        tokenService: { validateToken: jest.fn(async () => ({ valid: true })) },
    });
    getDaLiveAuthServiceMock.mockReturnValue({
        isAuthenticated: jest.fn(async () => true),
        getAccessToken: jest.fn(async () => 'da-token'),
    });

    const daOps: DaLiveOpsDouble = {
        listDirectory: jest.fn(async () => []),
        createSource: jest.fn(async () => ({ success: true, path: '/about.html' })),
        deleteSource: jest.fn(async () => ({ success: true })),
        readSource: jest.fn(async () => ({
            status: 200,
            body: '<body><main>hi</main></body>',
            bytes: 28,
            truncated: false,
        })),
    };
    DaLiveContentOperationsMock.mockImplementation(() => daOps);

    const helix: HelixDouble = {
        previewAndPublishPage: jest.fn(async () => undefined),
        unpublishPage: jest.fn(async () => true),
    };
    // The double is partial by design — these two methods are all these tools
    // call. Cast at the boundary, once, per ADR-016.
    HelixServiceMock.mockImplementation(() => helix as unknown as HelixService);

    const fetchMock = jest.fn(async () => okResponse('<body><main>hi</main></body>'));
    global.fetch = fetchMock as unknown as typeof fetch;

    return { daOps, helix, fetchMock };
}
