/**
 * ensureProjectOrgContext Tests
 *
 * The reactive, action-time org-context gate — sibling of ensureAdobeIOAuth.
 * Mirrors that guard's shape: detect -> (mismatch?) Switch IMS Org / Cancel ->
 * forced login -> re-verify. Covers:
 * - Reachable / no-org fast paths (no prompt, no forced login)
 * - Mismatch -> Cancel / dismiss (no forced login)
 * - Mismatch -> Switch -> reachable after switch
 * - Mismatch -> Switch -> still mismatched after switch
 * - Forced login receives force=true + project context
 * - Custom logPrefix
 */

import * as vscode from 'vscode';
import {
    ensureProjectOrgContext,
    type OrgContextAuthManager,
} from '@/features/authentication/services/ensureProjectOrgContext';
import { detectProjectOrgMismatch } from '@/features/authentication/services/detectProjectOrgMismatch';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

jest.mock('vscode');
jest.mock('@/features/authentication/services/detectProjectOrgMismatch', () => ({
    detectProjectOrgMismatch: jest.fn(),
}));

const mockDetect = detectProjectOrgMismatch as jest.MockedFunction<typeof detectProjectOrgMismatch>;

function createMockAuthManager(
    overrides: Partial<OrgContextAuthManager> = {},
): OrgContextAuthManager {
    return {
        getOrganizations: jest.fn().mockResolvedValue([]),
        loginAndRestoreProjectContext: jest.fn().mockResolvedValue(true),
        ...overrides,
    };
}

function createMockLogger(): Logger {
    return {
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as unknown as Logger;
}

function createProject(): Project {
    return {
        name: 'Acme Demo',
        path: '/test/acme',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        adobe: {
            organization: 'org-expected',
            projectId: 'proj-1',
            workspace: 'ws-1',
        },
        componentInstances: {},
        componentConfigs: {},
    } as unknown as Project;
}

describe('ensureProjectOrgContext', () => {
    let logger: Logger;
    let project: Project;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = createMockLogger();
        project = createProject();
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
    });

    // ---- Fast paths ----------------------------------------------------------

    it('returns reachable without prompting when the org is reachable', async () => {
        mockDetect.mockResolvedValue({ reachable: true, expectedOrg: 'org-expected', currentOrg: 'Expected Org' });
        const authManager = createMockAuthManager();

        const result = await ensureProjectOrgContext({ authManager, project, logger });

        expect(result).toEqual({ reachable: true, currentOrg: 'Expected Org' });
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(authManager.loginAndRestoreProjectContext).not.toHaveBeenCalled();
    });

    it('returns reachable (non-blocking) when there is nothing to check', async () => {
        // Detector returns undefined: no Adobe org, or the check could not run.
        mockDetect.mockResolvedValue(undefined);
        const authManager = createMockAuthManager();

        const result = await ensureProjectOrgContext({ authManager, project, logger });

        expect(result).toEqual({ reachable: true });
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    // ---- Mismatch -> Cancel --------------------------------------------------

    it('returns cancelled and does NOT force login when user clicks Cancel', async () => {
        mockDetect.mockResolvedValue({ reachable: false, expectedOrg: 'org-expected', currentOrg: 'Wrong Org' });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');
        const authManager = createMockAuthManager();

        const result = await ensureProjectOrgContext({ authManager, project, logger });

        expect(result).toEqual({ reachable: false, cancelled: true, currentOrg: 'Wrong Org' });
        expect(authManager.loginAndRestoreProjectContext).not.toHaveBeenCalled();
    });

    it('returns cancelled when the dialog is dismissed (undefined)', async () => {
        mockDetect.mockResolvedValue({ reachable: false, expectedOrg: 'org-expected', currentOrg: 'Wrong Org' });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
        const authManager = createMockAuthManager();

        const result = await ensureProjectOrgContext({ authManager, project, logger });

        expect(result.cancelled).toBe(true);
        expect(result.reachable).toBe(false);
    });

    // ---- Mismatch -> Switch --------------------------------------------------

    it('forces a switch and returns reachable when the switch lands in the right org', async () => {
        mockDetect
            .mockResolvedValueOnce({ reachable: false, expectedOrg: 'org-expected', currentOrg: 'Wrong Org' })
            .mockResolvedValueOnce({ reachable: true, expectedOrg: 'org-expected', currentOrg: 'Expected Org' });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Switch IMS Org');
        const authManager = createMockAuthManager();

        const result = await ensureProjectOrgContext({ authManager, project, logger });

        expect(result).toEqual({ reachable: true, currentOrg: 'Expected Org' });
        expect(authManager.loginAndRestoreProjectContext).toHaveBeenCalledWith(
            { organization: 'org-expected', projectId: 'proj-1', workspace: 'ws-1' },
            true, // forced — present the IMS account/org chooser
        );
        expect(mockDetect).toHaveBeenCalledTimes(2);
    });

    it('telegraphs the browser launch with a progress notification during the switch', async () => {
        mockDetect
            .mockResolvedValueOnce({ reachable: false, expectedOrg: 'org-expected', currentOrg: 'Wrong Org' })
            .mockResolvedValueOnce({ reachable: true, expectedOrg: 'org-expected', currentOrg: 'Expected Org' });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Switch IMS Org');
        const authManager = createMockAuthManager();

        await ensureProjectOrgContext({ authManager, project, logger });

        // The forced login runs inside a notification progress (reused Open-in-Browser shape).
        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({
                location: vscode.ProgressLocation.Notification,
                title: expect.stringContaining('Opening browser'),
            }),
            expect.any(Function),
        );
    });

    it('returns not reachable (not cancelled) when still mismatched after the switch', async () => {
        mockDetect
            .mockResolvedValueOnce({ reachable: false, expectedOrg: 'org-expected', currentOrg: 'Wrong Org' })
            .mockResolvedValueOnce({ reachable: false, expectedOrg: 'org-expected', currentOrg: 'Wrong Org' });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Switch IMS Org');
        const authManager = createMockAuthManager();

        const result = await ensureProjectOrgContext({ authManager, project, logger });

        expect(result.reachable).toBe(false);
        expect(result.cancelled).toBeFalsy();
    });

    // ---- Options -------------------------------------------------------------

    it('uses the custom logPrefix in the mismatch warning log', async () => {
        mockDetect.mockResolvedValue({ reachable: false, expectedOrg: 'org-expected', currentOrg: 'Wrong Org' });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');
        const authManager = createMockAuthManager();

        await ensureProjectOrgContext({ authManager, project, logger, logPrefix: '[Mesh Deployment]' });

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('[Mesh Deployment]'));
    });

    it('names the current org and project in the prompt', async () => {
        mockDetect.mockResolvedValue({ reachable: false, expectedOrg: 'org-expected', currentOrg: 'Wrong Org' });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');
        const authManager = createMockAuthManager();

        await ensureProjectOrgContext({ authManager, project, logger });

        const [message, ...actions] = (vscode.window.showWarningMessage as jest.Mock).mock.calls[0];
        expect(message).toContain('Wrong Org');
        expect(message).toContain('Acme Demo');
        expect(actions).toEqual(['Switch IMS Org', 'Cancel']);
    });
});
