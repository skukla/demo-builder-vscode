/**
 * Shared setup for the create_project suites.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import those
 * from HERE and declare no jest.mock of their own — jest.mock hoists above the
 * imports of the module it appears in, NOT across modules, so an import left
 * behind in a spec loads the real module before these mocks register.
 *
 * Extracted when the suite split in two: path behaviour (createProjectTool.test.ts)
 * and argument validation + the registered schema
 * (createProjectTool-validation.test.ts).
 */

import { registerCreateProjectTool } from '@/features/ai/server/createProjectTool';
import { getAdobeTarget, runWithAdobeTarget } from '@/features/ai/server/adobeTargetStore';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import { buildProjectConfig } from '@/features/project-creation/ui/wizard/wizardHelpers';
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import { getGitHubServices, getDaLiveAuthService } from '@/features/eds/handlers/edsHelpers';
import {
    getAvailableStacksForPackage,
    getResolvedMeshRequirement,
    getSelectablePackages,
    getStorefrontForStack,
} from '@/features/components/services/demoPackageLoader';
import type { HandlerContext } from '@/types/handlers';

jest.mock('@/features/project-creation/handlers/executor', () => ({
    executeProjectCreation: jest.fn(async () => undefined),
}));
jest.mock('@/features/project-creation/ui/wizard/wizardHelpers', () => ({
    buildProjectConfig: jest.fn(() => ({ projectName: 'assembled' })),
}));
jest.mock('@/features/components/services/demoPackageLoader', () => ({
    getSelectablePackages: jest.fn(async () => [
        { id: 'citisignal', storefronts: { 'headless-paas': {}, 'eds-paas': {} } },
    ]),
    getStorefrontForStack: jest.fn(async () => ({
        templateOwner: 'o',
        templateRepo: 'r',
        contentSource: { org: 'co', site: 'cs' },
        contentPatches: [{ path: '/index' }],
    })),
    getAvailableStacksForPackage: jest.fn(async () => ['headless-paas', 'eds-paas']),
    getAutoSelectedOptionalDependencies: jest.fn(async () => []),
    getResolvedMeshRequirement: jest.fn(() => false),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(() => ({
        tokenService: { validateToken: jest.fn(async () => ({ valid: true })) },
    })),
    getDaLiveAuthService: jest.fn(() => ({ isAuthenticated: jest.fn(async () => true) })),
}));
jest.mock('@/features/eds/handlers/edsHandlers', () => ({
    edsHandlers: { 'storefront-setup-start': jest.fn() },
}));
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    getAdobeTarget: jest.fn(() => ({ orgId: 'org-stored' })),
    runWithAdobeTarget: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

export {
    registerCreateProjectTool,
    getAdobeTarget,
    runWithAdobeTarget,
    buildProjectConfig,
    executeProjectCreation,
    edsHandlers,
    getGitHubServices,
    getDaLiveAuthService,
    getAvailableStacksForPackage,
    getResolvedMeshRequirement,
    getSelectablePackages,
    getStorefrontForStack,
};
export type { McpToolSchema };

export const storefrontSetup = edsHandlers['storefront-setup-start'] as jest.Mock;

/** Default storefront-setup mock: emits a progress + complete event, succeeds. */
export function defaultStorefrontSetup(): void {
    storefrontSetup.mockImplementation(
        async (ctx: { sendMessage: (t: string, d?: unknown) => Promise<void> }) => {
            await ctx.sendMessage('storefront-setup-progress', {
                phase: 'repo',
                message: 'Creating repo',
                progress: 10,
            });
            await ctx.sendMessage('storefront-setup-complete', {
                repoUrl: 'https://github.com/o/r',
            });
            return { success: true };
        }
    );
}

 
type ToolHandler = (args?: any) => Promise<{ content: Array<{ text: string }> }>;

export interface FakeServer {
    registerTool(name: string, def: McpToolSchema, handler: ToolHandler): void;
    /** The schema block `registerTool` was handed — what `tools/list` shows an agent. */
    definitionOf(): McpToolSchema;
     
    call(args?: unknown): Promise<any>;
}

export function fakeServer(): FakeServer {
    const tools = new Map<string, ToolHandler>();
    const defs = new Map<string, McpToolSchema>();
    return {
        registerTool(name: string, def: McpToolSchema, handler: ToolHandler) {
            tools.set(name, handler);
            defs.set(name, def);
        },
        definitionOf: () => defs.get('create_project')!,
        async call(args?: unknown) {
            return JSON.parse((await tools.get('create_project')!(args)).content[0].text);
        },
    };
}

export const authManager = {
    isAuthenticated: jest.fn(async () => true),
    getCurrentOrganization: jest.fn(async () => ({ id: 'org-1', name: 'Org' })),
    getCurrentProject: jest.fn(async () => ({ id: 'proj-1', name: 'Proj' })),
    // Typed to include `undefined` because that is a REAL runtime answer — the
    // production guard branches on `if (!workspace)`. Narrowing the mock to the
    // happy shape would make the unset case untypeable, which is how a test suite
    // ends up unable to express the condition the code exists to handle.
    getCurrentWorkspace: jest.fn(
        async (): Promise<{ id: string; name: string } | undefined> => ({
            id: 'ws-1',
            name: 'Stage',
        })
    ),
};

export const ctxFactory = (): HandlerContext =>
    ({
        authManager,
        context: {},
        sendMessage: jest.fn(async () => undefined),
    }) as unknown as HandlerContext;

/** A complete MCP-session Adobe target — org, project AND workspace all chosen. */
export const SESSION_TARGET = {
    orgId: 'org-session',
    orgCode: 'SESSION@AdobeOrg',
    orgName: 'Session Org',
    projectId: 'proj-session',
    projectName: 'Session Project',
    workspaceId: 'ws-session',
    workspaceName: 'Session Workspace',
};

export const HEADLESS = {
    projectName: 'my-proj',
    package: 'citisignal',
    stack: 'headless-paas',
    confirm: true,
};

export const EDS = {
    projectName: 'eds-proj',
    package: 'citisignal',
    stack: 'eds-paas',
    repoName: 'my-repo',
    daLiveOrg: 'org',
    daLiveSite: 'site',
    confirm: true,
};

/** Register the tool against a fresh fake server and hand back the server. */
export function toolServer(): FakeServer {
    const server = fakeServer();
    registerCreateProjectTool(server, ctxFactory);
    return server;
}

/** The `ProjectConfigSource` `buildProjectConfig` was handed on its first call. */
 
export function capturedWizardState(): any {
    return (buildProjectConfig as jest.Mock).mock.calls[0][0];
}
