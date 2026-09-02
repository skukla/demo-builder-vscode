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
