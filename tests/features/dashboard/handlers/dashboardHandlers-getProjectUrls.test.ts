/**
 * handleGetProjectUrls — the read behind the get_project_urls MCP tool.
 *
 * Computes the useful project URLs (local storefront, EDS live site + DA.live
 * authoring, Commerce admin, Developer Console deep link) from the SAME getters
 * the open-in-browser handlers use — but returns them as data instead of
 * opening a browser. It is a pure read: it must NOT call openExternal and must
 * NOT trigger the admin-panel "Open Configure" prompt when the URL is absent.
 */

// The DA.live URL needs the resolved authoring experience and the EW canvas
// branch — both read vscode settings when project metadata is absent. Stub the
// two config reads (default: classic experience, no ?nx override); the URL
// ASSEMBLY under test stays real.
jest.mock('@/features/eds/handlers/edsHelpers', () => {
    const actual = jest.requireActual('@/features/eds/handlers/edsHelpers');
    return {
        ...actual,
        getEwCanvasBranch: jest.fn(() => ''),
        resolveProjectAuthoringExperience: jest.fn(() => 'da-live-classic'),
    };
});

import { setupMocks, createDashboardProject } from './dashboardHandlers.testUtils';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/**
 * `context: unknown` erased the argument at every call — the fifth instance of that
 * exact shape on this programme. Typed to the real context, the cast is unnecessary.
 */
async function run(context: HandlerContext) {
    const { handleGetProjectUrls } = await import(
        '@/features/dashboard/handlers/dashboardHandlers'
    );
    return handleGetProjectUrls(context);
}

function urlsOf(result: { data?: unknown }): Record<string, string> {
    return (result.data as { urls: Record<string, string> }).urls;
}

/** An EDS project with the storefront metadata the URL getters read. */
function edsProject(overrides: Partial<Project> = {}): Partial<Project> {
    return {
        selectedStack: 'eds-dalive',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    liveUrl: 'https://main--site--owner.aem.live',
                    daLiveOrg: 'my-org',
                    daLiveSite: 'my-site',
                },
            },
        } as unknown as Project['componentInstances'],
        ...overrides,
    };
}

describe('handleGetProjectUrls', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const {
            validateOrgId,
            validateProjectId,
            validateWorkspaceId,
        } = require('@/core/validation/validators/AdobeResourceValidator');
        validateOrgId.mockImplementation(() => undefined);
        validateProjectId.mockImplementation(() => undefined);
        validateWorkspaceId.mockImplementation(() => undefined);
    });

    it('errors when no project is loaded', async () => {
        const { mockContext } = setupMocks();
        mockContext.stateManager.getCurrentProject = jest.fn().mockResolvedValue(undefined);

        const result = await run(mockContext);
        expect(result.success).toBe(false);
    });

    it('is a read: never opens a browser and never prompts', async () => {
        const { mockContext } = setupMocks();
        const vscode = require('vscode');

        const result = await run(mockContext);

        expect(result.success).toBe(true);
        expect(vscode.env.openExternal).not.toHaveBeenCalled();
        expect(vscode.window.showInformationMessage ?? (() => {})).toBeDefined();
        // No admin-panel prompt path — showInformationMessage is not even called.
        if (vscode.window.showInformationMessage) {
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        }
    });

    it('returns the local storefront URL only when a frontend port is assigned', async () => {
        // The default mock project runs headless on port 3000.
        const { mockContext } = setupMocks();
        const withPort = await run(mockContext);
        expect(urlsOf(withPort).storefront).toBe('http://localhost:3000');

        // Stopped / no port → storefront omitted.
        const stopped = createDashboardProject({
            componentInstances: {
                headless: {
                    id: 'headless',
                    name: 'CitiSignal Next.js',
                    type: 'frontend',
                    status: 'stopped',
                },
            },
        });
        mockContext.stateManager.getCurrentProject = jest.fn().mockResolvedValue(stopped);
        const noPort = await run(mockContext);
        expect(urlsOf(noPort).storefront).toBeUndefined();
    });

    it('returns the Commerce admin URL from the config getter, omitting it when unresolvable', async () => {
        const { mockContext } = setupMocks();
        // Default mock has no ADOBE_COMMERCE_ADMIN_URL and no ACCS endpoint → omitted.
        const result = await run(mockContext);
        expect(urlsOf(result).commerceAdmin).toBeUndefined();

        const withAdmin = createDashboardProject({
            componentConfigs: {
                'commerce-paas': { ADOBE_COMMERCE_ADMIN_URL: 'https://admin.example.com' },
            },
        });
        mockContext.stateManager.getCurrentProject = jest.fn().mockResolvedValue(withAdmin);
        const result2 = await run(mockContext);
        expect(urlsOf(result2).commerceAdmin).toBe('https://admin.example.com');
    });

    it('returns a Developer Console workspace deep link when the Adobe context is complete', async () => {
        const { mockContext } = setupMocks();
        const result = await run(mockContext);
        expect(urlsOf(result).devConsole).toBe(
            'https://developer.adobe.com/console/projects/org123/project123/workspaces/workspace123/details'
        );
    });

    it('falls back to the generic Console URL when Adobe IDs are absent', async () => {
        const noAdobe = createDashboardProject({ adobe: undefined });
        const { mockContext } = setupMocks();
        mockContext.stateManager.getCurrentProject = jest.fn().mockResolvedValue(noAdobe);

        const result = await run(mockContext);
        expect(urlsOf(result).devConsole).toBe('https://developer.adobe.com/console');
    });

    it('includes the EDS live site + DA.live authoring URLs for an EDS project', async () => {
        const { mockContext } = setupMocks();
        mockContext.stateManager.getCurrentProject = jest
            .fn()
            .mockResolvedValue(createDashboardProject(edsProject()));

        const urls = urlsOf(await run(mockContext));
        expect(urls.liveSite).toBe('https://main--site--owner.aem.live');
        expect(urls.daLive).toBe('https://da.live/#/my-org/my-site');
    });

    it('omits the EDS URLs for a non-EDS project', async () => {
        const { mockContext } = setupMocks();
        const urls = urlsOf(await run(mockContext));
        expect(urls.liveSite).toBeUndefined();
        expect(urls.daLive).toBeUndefined();
    });
});
