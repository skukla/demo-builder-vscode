/**
 * Shared harness for the `cloudResourceTools` suite family.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import those
 * from HERE and declare no jest.mock of their own — jest.mock hoists above the
 * imports of the module it appears in, NOT across modules, so an import left
 * behind in a spec loads the real module before these mocks register.
 *
 * The GitHub and DA.live service layers are replaced wholesale: these tools are
 * thin adapters over them, so a real call would be a real repository deletion.
 */

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(),
    getDaLiveAuthService: jest.fn(() => mockDaLiveAuth),
    // The DA.live session the code removal after a repository delete reads (EDS-67).
    tryCreateDaLiveTokenProvider: jest.fn(() => ({ getAccessToken: () => mockDaLiveAuth.getAccessToken() })),
}));

/** The DA.live session: no token by default, so the suites drive the IMS fallback they were written for. */
const mockDaLiveAuth = { getAccessToken: jest.fn(async (): Promise<string | null> => null) };
const mockInspectToken = jest.fn();
const mockListOrgSites = jest.fn();
const mockDeleteAllSiteContent = jest.fn();

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            getTokenManager: () => ({ inspectToken: mockInspectToken }),
        })),
    },
}));
jest.mock('@/features/eds/services/daLive/daLiveOrgOperations', () => ({
    DaLiveOrgOperations: jest.fn(() => ({ listOrgSites: mockListOrgSites })),
}));
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn(() => ({
        sourceOps: { deleteAllSiteContent: mockDeleteAllSiteContent },
    })),
}));
// The teardown's last step (site permissions and config) is DA.live's own client. Unmocked,
// `cleanup_dalive_site` made REAL calls to admin.da.live with the fake token, and its 401
// then sent the token to IMS (measured 2026-10-28 with a fetch probe). Answered here.
jest.mock('@/features/eds/services/daLive/daLiveConfigService', () => ({
    DaLiveConfigService: jest.fn(() => ({
        removeSitePermissions: async () => ({ success: true }),
        deleteSiteConfig: async () => ({ success: true }),
    })),
}));
jest.mock('@/features/eds/services/daLive/daLiveTokenProviders', () => ({
    createDaLiveServiceTokenProvider: (service: { getAccessToken(): Promise<string | null> }) => ({
        getAccessToken: () => service.getAccessToken(),
    }),
}));
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    getAdobeTarget: jest.fn(() => ({ orgId: 'org-stored' })),
    runWithAdobeTarget: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

// Below the factories on purpose: they hoist above these, so the subject binds
// to the mocked modules.
export { registerCloudResourceTools } from '@/features/ai/server/cloudResourceTools';
export { runWithAdobeTarget } from '@/features/ai/server/adobeTargetStore';
export { DaLiveOrgOperations } from '@/features/eds/services/daLive/daLiveOrgOperations';
export { DaLiveContentOperations } from '@/features/eds/services/daLive/daLiveContentOperations';

export { mockDaLiveAuth, mockInspectToken, mockListOrgSites, mockDeleteAllSiteContent };
export const getGitHubServicesMock = getGitHubServices as jest.Mock;

/**
 * The shape a registered tool's handler has, once the server has it.
 *
 * Typed to what `McpToolServer.registerTool` actually declares, so the fake
 * server is assignable to it and a drift in the real signature fails here.
 */
 
type ToolHandler = (args?: any, extra?: unknown) => Promise<any>;

/**
 * A stand-in MCP server that keeps BOTH halves of every registration.
 *
 * The definition is not decoration: `annotations.readOnlyHint` /
 * `destructiveHint` and `needsAuth` are what the real server consults to decide
 * whether a call needs consent, and `inputSchema` is the only validation an
 * agent's arguments get. A fake that discarded the definition would leave all
 * three unasserted while every handler test still passed.
 */
export function fakeServer() {
    const tools = new Map<string, ToolHandler>();
    const definitions = new Map<string, McpToolSchema>();
    return {
        registerTool(name: string, def: McpToolSchema, handler: ToolHandler) {
            tools.set(name, handler);
            definitions.set(name, def);
        },

         
        async call(name: string, args?: unknown): Promise<any> {
            return JSON.parse((await tools.get(name)!(args)).content[0].text);
        },

        /** The definition a tool was registered with. */
        definition(name: string): McpToolSchema {
            return definitions.get(name)!;
        },

        names(): string[] {
            return [...definitions.keys()];
        },
    };
}

/**
 * A real HandlerContext carries the extension context and its secret store, and
 * these tools read it to reach the GitHub services. The fixture used to be `{}`
 * cast straight to HandlerContext — which typechecked, because a cast at a call
 * boundary silences exactly this, and passed only because every consumer of the
 * context was mocked.
 */
export const ctxFactory = () =>
    createMockHandlerContext({
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
    });

/** Build a GitHub services double; override pieces per test. */
export function gh(
    overrides: {
        valid?: boolean;
        validateThrows?: boolean;
        repos?: Array<{ fullName: string; isPrivate: boolean; updatedAt: string }>;
        deleteRepository?: jest.Mock;
        createFromTemplate?: jest.Mock;
        waitForContent?: jest.Mock;
        /** The repository's files, read before a delete. Empty by default: not a storefront. */
        listRepoFiles?: jest.Mock;
    } = {}
) {
    const validateToken = overrides.validateThrows
        ? jest.fn(async () => {
              throw new Error('network');
          })
        : jest.fn(async () => ({ valid: overrides.valid ?? true }));
    return {
        tokenService: { validateToken },
        repoOperations: {
            listUserRepositories: jest.fn(async () => overrides.repos ?? []),
        },
        repoLifecycle: {
            deleteRepository: overrides.deleteRepository ?? jest.fn(async () => undefined),
            // Shape from GitHubRepo (`types.ts:47-66`): fullName/htmlUrl/defaultBranch,
            // and NO `owner` field — the tool derives the owner from fullName.
            createFromTemplate:
                overrides.createFromTemplate ??
                jest.fn(async () => ({
                    id: 1,
                    name: 'my-site',
                    fullName: 'acme/my-site',
                    htmlUrl: 'https://github.com/acme/my-site',
                    cloneUrl: 'https://github.com/acme/my-site.git',
                    defaultBranch: 'main',
                    isPrivate: false,
                })),
            waitForContent: overrides.waitForContent ?? jest.fn(async () => true),
        },
        fileOperations: {
            listRepoFiles: overrides.listRepoFiles ?? jest.fn(async () => []),
        },
    };
}

/**
 * The per-test reset both suites run. Call from each spec's OWN `beforeEach` —
 * one declared here would not apply to a module that imports it.
 */
export function resetCloudResourceMocks(): void {
    jest.clearAllMocks();
    mockInspectToken.mockResolvedValue({ valid: true, expiresIn: 60, token: 'ims-token' });
    mockListOrgSites.mockResolvedValue([]);
    mockDeleteAllSiteContent.mockResolvedValue({ success: true, deletedCount: 0 });
}
