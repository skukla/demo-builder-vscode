/**
 * ensureProjectAdobeContext Tests
 *
 * The combined existing-project mesh pre-flight: auth (ensureAdobeIOAuth) THEN
 * org context (ensureProjectOrgContext), in one call so the two gates can't
 * drift apart across the deploy/reset entry points. Verifies:
 * - auth fail short-circuits (org check NOT run), blockedBy 'auth'
 * - auth ok + org unreachable -> blockedBy 'org' (+ cancelled passthrough)
 * - auth ok + org reachable -> ready
 * - forwards projectContext/warningMessage/logPrefix to the auth guard, and
 *   project/logPrefix to the org guard
 */

import {
    ensureProjectAdobeContext,
    type ProjectAdobeAuthManager,
} from '@/features/authentication/services/ensureProjectAdobeContext';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { ensureProjectOrgContext } from '@/features/authentication/services/ensureProjectOrgContext';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

jest.mock('@/core/auth/adobeAuthGuard', () => ({ ensureAdobeIOAuth: jest.fn() }));
jest.mock('@/features/authentication/services/ensureProjectOrgContext', () => ({
    ensureProjectOrgContext: jest.fn(),
}));

const mockAuth = ensureAdobeIOAuth as jest.MockedFunction<typeof ensureAdobeIOAuth>;
const mockOrg = ensureProjectOrgContext as jest.MockedFunction<typeof ensureProjectOrgContext>;

function createLogger(): Logger {
    return { trace: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;
}

function createProject(): Project {
    return {
        name: 'Acme Demo',
        path: '/test/acme',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        adobe: { organization: 'org-expected', projectId: 'proj-1', workspace: 'ws-1' },
        componentInstances: {},
        componentConfigs: {},
    } as unknown as Project;
}

describe('ensureProjectAdobeContext', () => {
    const authManager = {} as ProjectAdobeAuthManager;
    let logger: Logger;
    let project: Project;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = createLogger();
        project = createProject();
    });

    it('short-circuits on auth failure and does NOT run the org check', async () => {
        mockAuth.mockResolvedValue({ authenticated: false, cancelled: true });

        const result = await ensureProjectAdobeContext({ authManager, project, logger });

        expect(result).toEqual({ ready: false, cancelled: true, blockedBy: 'auth' });
        expect(mockOrg).not.toHaveBeenCalled();
    });

    it('reports blockedBy "org" when authenticated but the org is unreachable', async () => {
        mockAuth.mockResolvedValue({ authenticated: true });
        mockOrg.mockResolvedValue({ reachable: false, currentOrg: 'Wrong Org' });

        const result = await ensureProjectAdobeContext({ authManager, project, logger });

        expect(result).toEqual({ ready: false, blockedBy: 'org', currentOrg: 'Wrong Org' });
    });

    it('passes through a cancelled org switch', async () => {
        mockAuth.mockResolvedValue({ authenticated: true });
        mockOrg.mockResolvedValue({ reachable: false, cancelled: true, currentOrg: 'Wrong Org' });

        const result = await ensureProjectAdobeContext({ authManager, project, logger });

        expect(result).toEqual({ ready: false, cancelled: true, blockedBy: 'org', currentOrg: 'Wrong Org' });
    });

    it('is ready when authenticated and the org is reachable', async () => {
        mockAuth.mockResolvedValue({ authenticated: true });
        mockOrg.mockResolvedValue({ reachable: true, currentOrg: 'Expected Org' });

        const result = await ensureProjectAdobeContext({ authManager, project, logger });

        expect(result).toEqual({ ready: true, currentOrg: 'Expected Org' });
    });

    it('forwards project context + options to the auth guard, and project + prefix to the org guard', async () => {
        mockAuth.mockResolvedValue({ authenticated: true });
        mockOrg.mockResolvedValue({ reachable: true, currentOrg: 'Expected Org' });

        await ensureProjectAdobeContext({
            authManager,
            project,
            logger,
            logPrefix: '[Mesh Deployment]',
            warningMessage: 'Adobe sign-in required to deploy mesh.',
        });

        expect(mockAuth).toHaveBeenCalledWith(expect.objectContaining({
            authManager,
            logger,
            logPrefix: '[Mesh Deployment]',
            warningMessage: 'Adobe sign-in required to deploy mesh.',
            projectContext: { organization: 'org-expected', projectId: 'proj-1', workspace: 'ws-1' },
        }));
        expect(mockOrg).toHaveBeenCalledWith(expect.objectContaining({
            authManager, project, logger, logPrefix: '[Mesh Deployment]',
        }));
    });
});
