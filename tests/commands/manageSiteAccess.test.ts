/**
 * ManageSiteAccessCommand — the route offered to someone who holds no role.
 *
 * Until 2026-09-14 this command opened `tools.aem.live/bot/setup` with the site
 * in the query string. That page authenticates ONLY with a one-time key the AEM
 * Code Sync bot puts in the URL during a GitHub App install, so opened from here
 * it could neither read the config nor add a user. A colleague followed it for
 * two sites and got "We couldn't load your configuration for editing". These
 * tests pin what the command offers instead, and that it still reports the
 * truth by polling rather than assuming the route worked.
 */

jest.mock('@/core/utils/browserUtils', () => ({ openUrl: jest.fn() }));

jest.mock('@/features/eds/services/configService/siteAccessManagerHeadless', () => ({
    listSiteAccess: jest.fn(),
    addSiteAdmin: jest.fn(),
    removeSiteAdmin: jest.fn(),
    looksLikeEmail: jest.fn(() => true),
}));

jest.mock('@/features/eds/services/configService/configAccessRecovery', () => ({
    waitForConfigAccess: jest.fn(),
}));

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getDaLiveAuthService: jest.fn(() => ({})),
}));

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => ({ getAccessToken: jest.fn() })),
}));

import * as vscode from 'vscode';
import { ManageSiteAccessCommand } from '@/commands/manageSiteAccess';
import type { StateManager } from '@/core/state/stateManager';
import { openUrl } from '@/core/utils/browserUtils';
import { waitForConfigAccess } from '@/features/eds/services/configService/configAccessRecovery';
import {
    listSiteAccess,
    type SiteAccessListing,
} from '@/features/eds/services/configService/siteAccessManagerHeadless';
import type { Logger } from '@/types/logger';
import { createMockExtensionContext } from '../helpers/extensionContextFake';
import { createMockLogger } from '../helpers/loggerFake';
import { createMockProject } from '../helpers/projectFake';
import { createMockStateManager } from '../helpers/stateManagerFake';

const CODE_SYNC_APP_URL = 'https://github.com/apps/aem-code-sync/installations/select_target';

const PROJECT = createMockProject({
    name: 'Wire',
    path: '/projects/wire',
    selectedStack: 'eds-paas',
    componentInstances: {
        'eds-storefront': {
            id: 'eds-storefront',
            name: 'EDS Storefront',
            type: 'frontend',
            status: 'ready',
            metadata: { githubRepo: 'demo-org/wire', daLiveOrg: 'demo-org', daLiveSite: 'wire' },
        },
    },
});

const REFUSED: SiteAccessListing = {
    status: 'not_authorized',
    site: 'demo-org/wire',
    canManage: false,
};

const mockListSiteAccess = listSiteAccess as jest.MockedFunction<typeof listSiteAccess>;
const mockWait = waitForConfigAccess as jest.MockedFunction<typeof waitForConfigAccess>;
const mockOpenUrl = openUrl as jest.MockedFunction<typeof openUrl>;
const showWarning = vscode.window.showWarningMessage as jest.Mock;
const showInfo = vscode.window.showInformationMessage as jest.Mock;

function command(): ManageSiteAccessCommand {
    const stateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(PROJECT),
    }) as unknown as StateManager;
    return new ManageSiteAccessCommand(
        createMockExtensionContext(),
        stateManager,
        createMockLogger() as unknown as Logger,
    );
}

/** Every string any warning showed, message and buttons alike. */
function everythingWarned(): string {
    return JSON.stringify(showWarning.mock.calls);
}

describe('ManageSiteAccessCommand — no admin role', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockListSiteAccess.mockResolvedValue(REFUSED);
        mockWait.mockResolvedValue('refused');
    });

    it('never offers or opens the AEM setup page', async () => {
        showWarning.mockResolvedValueOnce('Open Code Sync App');

        await command().execute();

        // Positive control: the button this run clicked really was offered, so the
        // absence checks below are reading a run that went all the way through.
        expect(showWarning.mock.calls[0]).toContain('Open Code Sync App');
        expect(mockOpenUrl).toHaveBeenCalledTimes(1);
        expect(everythingWarned()).not.toMatch(/AEM setup page|bot\/setup/);
        // The User Admin tool went with it: measured 2026-09-23, it refuses the same
        // identity this command does, so offering it sent people to another 403.
        expect(everythingWarned()).not.toMatch(/User Admin/);
        const opened = mockOpenUrl.mock.calls.map(([url]) => url);
        // The SETUP page specifically, not all of tools.aem.live: User Admin lives on
        // that host too and IS offered, so a blanket host check would forbid the remedy.
        expect(opened.join(' ')).not.toContain('/bot/setup');
    });

    it('names the repository and gives the reinstall remedy', async () => {
        showWarning.mockResolvedValueOnce('Close');

        await command().execute();

        const message = showWarning.mock.calls[0][0] as string;
        expect(message).toContain('nobody who can grant it is visible');
        // Measured 2026-09-23: a full uninstall/reinstall of the Code Sync app writes
        // the roster entry; re-saving a repository does not. The message must carry
        // both halves or it sends people down the path that does nothing.
        expect(message).toContain('uninstall AEM Code Sync completely');
        expect(message).toContain('single repository is NOT enough');
        expect(message).toContain('every demo-org repository');
    });

    it('offers the GitHub settings page, because the app\'s own page cannot uninstall', async () => {
        showWarning.mockResolvedValueOnce('Open GitHub App Settings');

        await command().execute();

        expect(showWarning.mock.calls[0]).toContain('Open GitHub App Settings');
        expect(mockOpenUrl).toHaveBeenCalledWith('https://github.com/settings/installations');
        expect(mockWait).toHaveBeenCalled();
    });

    it('checks the two things that make the reinstall fail, when it never lands', async () => {
        showWarning.mockResolvedValueOnce('Open Code Sync App');

        await command().execute();

        const last = showWarning.mock.calls[showWarning.mock.calls.length - 1][0] as string;
        expect(last).toContain('UNINSTALLED');
        expect(last).toContain('primary email');
    });

    it('opens the Code Sync App on GitHub and polls for the grant', async () => {
        showWarning.mockResolvedValueOnce('Open Code Sync App');

        await command().execute();

        expect(showWarning.mock.calls[0]).toContain('Open Code Sync App');
        expect(mockOpenUrl).toHaveBeenCalledWith(CODE_SYNC_APP_URL);
        expect(mockWait).toHaveBeenCalledWith(
            expect.anything(),
            { owner: 'demo-org', repo: 'wire' },
            expect.anything(),
            expect.any(Function),
        );
    });

    it('names who can still add you when the grant never lands', async () => {
        showWarning.mockResolvedValueOnce('Open Code Sync App');

        await command().execute();

        const last = showWarning.mock.calls[showWarning.mock.calls.length - 1][0] as string;
        expect(last).toMatch(/still refused/i);
        expect(last).toContain('Adobe');
    });

    it('offers the repair once the grant lands', async () => {
        showWarning.mockResolvedValueOnce('Open Code Sync App');
        mockWait.mockResolvedValue('granted');

        await command().execute();

        expect(showInfo).toHaveBeenCalledWith(
            expect.stringContaining('Access confirmed'),
            'Repair Site Configuration',
            'Later',
        );
    });

    it('leads with the email change, offers the page that makes it, and polls', async () => {
        // The primary email is a PRECONDITION of the reinstall: the role is minted for
        // whichever address is primary at install time, so reinstalling first grants it
        // to the wrong one and reads as the remedy having failed.
        const explanation = 'Before you reinstall, change your GitHub primary email.';
        mockListSiteAccess.mockResolvedValue({
            ...REFUSED,
            identityMismatch: {
                githubPrimaryEmail: 'personal@example.com',
                adobeEmail: 'sc@adobe.example',
                explanation,
            },
        });
        showWarning.mockResolvedValueOnce('Open GitHub Email Settings');

        await command().execute();

        const [message, ...buttons] = showWarning.mock.calls[0] as [string, ...string[]];
        expect(message).toContain(explanation);
        expect(message).toContain('uninstall AEM Code Sync completely');
        expect(buttons).toEqual(['Open GitHub Email Settings', 'Open GitHub App Settings', 'Close']);
        expect(mockOpenUrl).toHaveBeenCalledWith('https://github.com/settings/emails');
        expect(mockWait).toHaveBeenCalled();

        const last = showWarning.mock.calls[showWarning.mock.calls.length - 1][0] as string;
        expect(last).toContain('Make sc@adobe.example your primary email on GitHub, THEN');
        // The order is the whole point, so the consequence of getting it wrong is stated.
        expect(last).toContain('grants the role to personal@example.com instead');
    });

    it('adds the readable org admins to the email explanation rather than replacing it', async () => {
        mockListSiteAccess.mockResolvedValue({
            ...REFUSED,
            orgAdmins: ['admin@example.test'],
            identityMismatch: {
                githubPrimaryEmail: 'personal@example.com',
                adobeEmail: 'sc@adobe.example',
                explanation: 'Explained.',
            },
        });
        showWarning.mockResolvedValueOnce('Close');

        await command().execute();

        expect(showWarning.mock.calls[0][0]).toBe(
            `You hold no admin role on ${REFUSED.site}. Explained. An org admin can also add you without any of that: admin@example.test.`,
        );
        expect(mockOpenUrl).not.toHaveBeenCalled();
    });

    it('names the org admins, and offers only them, when the roster is readable', async () => {
        mockListSiteAccess.mockResolvedValue({ ...REFUSED, orgAdmins: ['admin@example.test'] });
        showWarning.mockResolvedValueOnce('Close');

        await command().execute();

        expect(showWarning.mock.calls[0][0]).toContain('admin@example.test');
        expect(showWarning.mock.calls[0]).toStrictEqual([expect.any(String), 'Close']);
        expect(mockOpenUrl).not.toHaveBeenCalled();
        expect(mockWait).not.toHaveBeenCalled();
    });
});
