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
        expect(everythingWarned()).not.toMatch(/AEM setup|tools\.aem\.live/);
        const opened = mockOpenUrl.mock.calls.map(([url]) => url);
        expect(opened.join(' ')).not.toContain('tools.aem.live');
    });

    it('tells the user which repository to grant on GitHub', async () => {
        showWarning.mockResolvedValueOnce('Close');

        await command().execute();

        const message = showWarning.mock.calls[0][0] as string;
        expect(message).toContain('nobody who can grant it is visible');
        expect(message).toContain('save its access to wire');
        expect(message).toContain('"Site users"');
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
        expect(last).toContain('installed AEM Code Sync');
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
