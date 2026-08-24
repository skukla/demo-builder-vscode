/**
 * ensureMeshApiSubscribed (D2 Track A, Step 03)
 *
 * The shared helper that runs the bounded D1 subscriber before a live mesh
 * deploy. It resolves the project's catalog rows, builds the adapter over the
 * auth service, and runs `subscribeRequiredApis` under org-context targeting.
 *
 * All boundaries are mocked — no live Adobe/aio calls. We assert the apiKey
 * (API Mesh GraphQLServiceSDK) + baseline S2S (AdobeIOManagementAPISDK) paths,
 * catalog-driven requiredApis, org targeting via withOrgContext, and graceful
 * skip when the project has no mesh catalog row.
 */

import { ensureMeshApiSubscribed } from '@/features/app-builder/services/ensureMeshApiSubscribed';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

jest.mock('vscode');

// Catalog loader — control the rows returned per project selection.
jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAvailableAppBuilderComponents: jest.fn(),
}));
import { getAvailableAppBuilderComponents } from '@/features/components/services/appBuilderComponentCatalogLoader';

// withOrgContext — spy that the subscribe runs inside it; passthrough-executes fn.
jest.mock('@/core/shell', () => {
    const actual = jest.requireActual('@/core/shell');
    return {
        ...actual,
        withOrgContext: jest.fn((_target: unknown, fn: () => Promise<unknown>) => fn()),
    };
});
import { withOrgContext } from '@/core/shell';

const MESH = 'GraphQLServiceSDK';
const MGMT = 'AdobeIOManagementAPISDK';

function createProject(): Project {
    return {
        name: 'p',
        path: '/p',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        adobe: {
            organization: 'org-1',
            projectId: 'proj-1',
            projectName: 'proj-1',
            workspace: 'ws-1',
            authenticated: true,
        },
        componentSelections: { backend: 'adobe-commerce-paas', frontend: 'eds-storefront' },
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS',
                type: 'frontend',
                path: '/p/f',
                status: 'ready',
                port: 3000,
            } as any,
        },
        componentConfigs: {},
    };
}

function createAuthService() {
    return {
        getServicesForOrg: jest.fn().mockResolvedValue([
            { code: MESH, name: 'API Mesh', platformList: ['apiKey'], domainMandatory: true },
            { code: MGMT, name: 'I/O Management API', platformList: ['oauth_server_to_server'] },
        ]),
        createAdobeIdCredential: jest.fn().mockResolvedValue('apikey-int'),
        subscribeAdobeIdIntegrationToServices: jest.fn().mockResolvedValue(undefined),
        subscribeOAuthServerToServerIntegrationToServices: jest.fn().mockResolvedValue(undefined),
        ensureOAuthCredentialId: jest.fn().mockResolvedValue('oauth-int'),
        // Default: nothing subscribed yet → the subscribe paths proceed.
        getSubscribedServiceCodes: jest.fn().mockResolvedValue([]),
        getCachedOrganization: jest.fn().mockReturnValue(undefined),
    };
}

describe('ensureMeshApiSubscribed', () => {
    let logger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
        } as jest.Mocked<Logger>;
        (withOrgContext as jest.Mock).mockImplementation(
            (_t: unknown, fn: () => Promise<unknown>) => fn()
        );
        (getAvailableAppBuilderComponents as jest.Mock).mockReturnValue([
            { id: 'commerce-paas-mesh', name: 'Mesh', kind: 'mesh', requiredApis: [MESH] },
        ]);
    });

    it('subscribes the API Mesh apiKey service with the derived localhost domain', async () => {
        const authService = createAuthService();

        await ensureMeshApiSubscribed({
            project: createProject(),
            authService: authService as any,
            logger,
        });

        expect(authService.createAdobeIdCredential).toHaveBeenCalledWith(
            'org-1',
            'proj-1',
            'ws-1',
            expect.objectContaining({ platform: 'apiKey', domain: 'localhost:3000' })
        );
        expect(authService.subscribeAdobeIdIntegrationToServices).toHaveBeenCalledWith(
            'org-1',
            'apikey-int',
            expect.arrayContaining([expect.objectContaining({ sdkCode: MESH })])
        );
    });

    it('subscribes the baseline AdobeIOManagementAPISDK via the S2S path', async () => {
        const authService = createAuthService();

        await ensureMeshApiSubscribed({
            project: createProject(),
            authService: authService as any,
            logger,
        });

        expect(authService.ensureOAuthCredentialId).toHaveBeenCalledWith('org-1', 'proj-1', 'ws-1');
        expect(authService.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledWith(
            'org-1',
            'oauth-int',
            expect.arrayContaining([expect.objectContaining({ sdkCode: MGMT })])
        );
    });

    it('resolves requiredApis from the project catalog selection', async () => {
        const authService = createAuthService();

        await ensureMeshApiSubscribed({
            project: createProject(),
            authService: authService as any,
            logger,
        });

        expect(getAvailableAppBuilderComponents).toHaveBeenCalledWith(
            'adobe-commerce-paas',
            'eds-storefront'
        );
    });

    it('runs the subscribe inside withOrgContext (org-targeted, no aio console select)', async () => {
        const authService = createAuthService();

        await ensureMeshApiSubscribed({
            project: createProject(),
            authService: authService as any,
            logger,
        });

        expect(withOrgContext).toHaveBeenCalledWith(
            expect.objectContaining({ orgId: 'org-1' }),
            expect.any(Function)
        );
    });

    it('still subscribes (idempotent union) when an existing cred id is returned', async () => {
        const authService = createAuthService();
        authService.ensureOAuthCredentialId.mockResolvedValue('existing-int');

        await expect(
            ensureMeshApiSubscribed({
                project: createProject(),
                authService: authService as any,
                logger,
            })
        ).resolves.toEqual(expect.any(Array));
        expect(authService.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalled();
    });

    it('returns the resolved+subscribed API list (union incl. baseline) with names', async () => {
        const authService = createAuthService();

        const result = await ensureMeshApiSubscribed({
            project: createProject(),
            authService: authService as any,
            logger,
        });

        expect(result).toHaveLength(2);
        expect(result).toEqual(
            expect.arrayContaining([
                { code: MGMT, name: 'I/O Management API' },
                { code: MESH, name: 'API Mesh' },
            ])
        );
    });

    it('skips gracefully when the project has no mesh catalog row', async () => {
        (getAvailableAppBuilderComponents as jest.Mock).mockReturnValue([]);
        const authService = createAuthService();

        const result = await ensureMeshApiSubscribed({
            project: createProject(),
            authService: authService as any,
            logger,
        });

        expect(result).toEqual([]);
        expect(authService.getServicesForOrg).not.toHaveBeenCalled();
        expect(withOrgContext).not.toHaveBeenCalled();
    });

    it('forwards onProgress so a caller sees each API subscribe land', async () => {
        const authService = createAuthService();
        const events: Array<{ code: string; done: boolean }> = [];

        await ensureMeshApiSubscribed({
            project: createProject(),
            authService: authService as any,
            logger,
            onProgress: (event) => {
                events.push(event);
            },
        });

        expect(events).toContainEqual({ code: MGMT, done: true });
        expect(events).toContainEqual({ code: MESH, done: true });
    });

    it('skips when only non-mesh entries match the axes (e.g. the unrestricted blank shell)', async () => {
        // This is the MESH pre-deploy subscribe: an axis-unrestricted
        // kind:'integration' entry (app-builder-shell) matching the selection
        // must not resurrect the subscribe when no mesh entry matches.
        (getAvailableAppBuilderComponents as jest.Mock).mockReturnValue([
            { id: 'app-builder-shell', name: 'Shell', kind: 'integration' },
        ]);
        const authService = createAuthService();

        const result = await ensureMeshApiSubscribed({
            project: createProject(),
            authService: authService as any,
            logger,
        });

        expect(result).toEqual([]);
        expect(authService.getServicesForOrg).not.toHaveBeenCalled();
        expect(withOrgContext).not.toHaveBeenCalled();
    });
});
