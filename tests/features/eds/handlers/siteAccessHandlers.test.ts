/**
 * siteAccessHandlers — the Site access webview's host half.
 *
 * The managers are mocked, so these assert the ARGUMENTS they are handed
 * (which site, which email, which target) — a mock cannot see a malformed call
 * any other way.
 */

import * as vscode from 'vscode';
import { siteAccessHandlers } from '@/features/eds/handlers/siteAccessHandlers';
import { SITE_ACCESS_PROGRESS_MESSAGE } from '@/types/messages';
import { openUrl } from '@/core/utils/browserUtils';
import { waitForConfigAccess } from '@/features/eds/services/configService/configAccessRecovery';
import {
    addSiteAdmin,
    listSiteAccess,
    removeSiteAdmin,
} from '@/features/eds/services/configService/siteAccessManagerHeadless';
import {
    addContentReader,
    listContentReaders,
    removeContentReader,
} from '@/features/eds/services/daLive/contentAccessManagerHeadless';
import { getEdsDaLiveTarget, getEdsRepoParts } from '@/types/typeGuards';
import type { Project } from '@/types/base';
import type { SiteAccessChangeResult, SiteAccessView } from '@/types/webviewPayloads';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/core/utils/browserUtils', () => ({ openUrl: jest.fn() }));
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({ getDaLiveAuthService: jest.fn() }));
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => 'token-provider'),
}));
jest.mock('@/features/eds/services/configService/configAccessRecovery', () => ({
    waitForConfigAccess: jest.fn(),
}));
jest.mock('@/features/eds/services/configService/siteAccessManagerHeadless', () => ({
    ...jest.requireActual('@/features/eds/services/configService/siteAccessManagerHeadless'),
    listSiteAccess: jest.fn(),
    addSiteAdmin: jest.fn(),
    removeSiteAdmin: jest.fn(),
}));
jest.mock('@/features/eds/services/daLive/contentAccessManagerHeadless', () => ({
    ...jest.requireActual('@/features/eds/services/daLive/contentAccessManagerHeadless'),
    listContentReaders: jest.fn(),
    addContentReader: jest.fn(),
    removeContentReader: jest.fn(),
}));
jest.mock('@/types/typeGuards', () => ({
    ...jest.requireActual('@/types/typeGuards'),
    getEdsRepoParts: jest.fn(),
    getEdsDaLiveTarget: jest.fn(),
}));

const PROJECT = createMockProject({ name: 'demo' });
const TYPED = { org: 'acme', site: 'shop' };

function makeContext(project: Project | undefined) {
    return createMockHandlerContext({
        logger: createMockLogger(),
        sendMessage: jest.fn(),
        stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) }),
    });
}

function withStorefront(): void {
    jest.mocked(getEdsRepoParts).mockReturnValue({ owner: 'gh-owner', repo: 'storefront' });
    jest.mocked(getEdsDaLiveTarget).mockReturnValue({ org: 'da-org', site: 'storefront' });
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getEdsRepoParts).mockReturnValue(undefined);
    jest.mocked(getEdsDaLiveTarget).mockReturnValue(undefined);
    jest.mocked(listSiteAccess).mockResolvedValue({
        status: 'ok',
        site: 'gh-owner/storefront',
        canManage: true,
        siteAdmins: ['a@x.example'],
    });
    jest.mocked(listContentReaders).mockImplementation(async (target) => ({
        status: 'ok',
        ...target,
        readers: [{ email: 'r@x.example', actions: 'read' }],
    }));
});

describe('getSiteAccess', () => {
    it('reads both lists for the open storefront', async () => {
        withStorefront();
        const context = makeContext(PROJECT);

        const result = await siteAccessHandlers.getSiteAccess(context, { target: TYPED });
        const view = result.data as SiteAccessView;

        expect(listSiteAccess).toHaveBeenCalledWith(PROJECT, context.context, context.logger);
        // The project's site wins over anything typed.
        expect(listContentReaders).toHaveBeenCalledWith(
            { org: 'da-org', site: 'storefront' },
            context.context,
            context.logger,
        );
        expect(view.admins?.people).toHaveLength(1);
        expect(view.readers?.site).toBe('da-org/storefront');
    });

    it('with no storefront, reads only the content of the typed site', async () => {
        const context = makeContext(undefined);

        const view = (await siteAccessHandlers.getSiteAccess(context, { target: { org: ' acme ', site: 'shop' } }))
            .data as SiteAccessView;

        expect(listSiteAccess).not.toHaveBeenCalled();
        expect(listContentReaders).toHaveBeenCalledWith(TYPED, context.context, context.logger);
        expect(view.admins).toBeUndefined();
    });

    it('with nothing typed, reads nothing', async () => {
        const view = (await siteAccessHandlers.getSiteAccess(makeContext(undefined), {})).data as SiteAccessView;

        expect(view).toEqual({ readers: undefined });
        expect(listContentReaders).not.toHaveBeenCalled();
    });
});

describe('changes', () => {
    it('adds an admin to the open project and answers with the re-read lists', async () => {
        withStorefront();
        jest.mocked(addSiteAdmin).mockResolvedValue({ status: 'ok', canManage: true, verified: true });
        const context = makeContext(PROJECT);

        const result = await siteAccessHandlers.addSiteAdmin(context, { email: ' new@x.example ' });
        const { notice, view } = result.data as SiteAccessChangeResult;

        expect(addSiteAdmin).toHaveBeenCalledWith(PROJECT, 'new@x.example', context.context, context.logger);
        expect(notice).toEqual({ tone: 'success', message: 'new@x.example can now administer this site.' });
        expect(view.admins).toBeDefined();
    });

    it('logs the email masked and shows it in full', async () => {
        withStorefront();
        jest.mocked(removeSiteAdmin).mockResolvedValue({ status: 'ok', canManage: true, verified: true });
        const context = makeContext(PROJECT);

        const result = await siteAccessHandlers.removeSiteAdmin(context, { email: 'gone@x.example' });

        expect((result.data as SiteAccessChangeResult).notice.message).toContain('gone@x.example');
        const logged = jest.mocked(context.logger.info).mock.calls.map(([line]) => String(line)).join('\n');
        expect(logged).toMatch(/is no longer a configuration admin/);
        expect(logged).not.toContain('gone@x.example');
    });

    it('refuses an address that is not one, without calling anything', async () => {
        withStorefront();

        const result = await siteAccessHandlers.addSiteAdmin(makeContext(PROJECT), { email: 'not-an-email' });

        expect(result).toEqual({ success: false, error: 'That is not an email address.' });
        expect(addSiteAdmin).not.toHaveBeenCalled();
    });

    it('refuses an admin change with no storefront open', async () => {
        const result = await siteAccessHandlers.addSiteAdmin(makeContext(undefined), { email: 'a@x.example' });

        expect(result.success).toBe(false);
        expect(addSiteAdmin).not.toHaveBeenCalled();
    });

    it('adds a content reader to the typed site when no storefront is open', async () => {
        jest.mocked(addContentReader).mockResolvedValue({ status: 'ok', ...TYPED, verified: true });
        const context = makeContext(undefined);

        const result = await siteAccessHandlers.addContentReader(context, { email: 'r@x.example', target: TYPED });

        expect(addContentReader).toHaveBeenCalledWith(TYPED, 'r@x.example', context.context, context.logger);
        expect((result.data as SiteAccessChangeResult).notice.tone).toBe('success');
    });

    it('an unverified reader removal is a warning', async () => {
        jest.mocked(removeContentReader).mockResolvedValue({ status: 'ok', ...TYPED, verified: false });

        const result = await siteAccessHandlers.removeContentReader(makeContext(undefined), {
            email: 'r@x.example',
            target: TYPED,
        });

        expect((result.data as SiteAccessChangeResult).notice.tone).toBe('warning');
    });

    it('refuses a reader change with no site named', async () => {
        const result = await siteAccessHandlers.addContentReader(makeContext(undefined), { email: 'r@x.example' });

        expect(result.success).toBe(false);
        expect(addContentReader).not.toHaveBeenCalled();
    });
});

describe('waitForSiteAccess', () => {
    it('polls the storefront site, pushing progress, and offers the repair on a grant', async () => {
        withStorefront();
        jest.mocked(waitForConfigAccess).mockImplementation(async (_tokens, _site, _logger, onAttempt) => {
            await onAttempt?.(1, 4);
            return 'granted';
        });
        const context = makeContext(PROJECT);

        const result = await siteAccessHandlers.waitForSiteAccess(context);

        expect(waitForConfigAccess).toHaveBeenCalledWith(
            'token-provider',
            { owner: 'gh-owner', repo: 'storefront' },
            context.logger,
            expect.any(Function),
        );
        expect(context.sendMessage).toHaveBeenCalledWith(SITE_ACCESS_PROGRESS_MESSAGE, {
            message: expect.stringContaining('Checking access'),
        });
        expect((result.data as SiteAccessChangeResult).notice.offerRepair).toBe(true);
    });

    it('says what is still wrong when the grant never lands', async () => {
        withStorefront();
        jest.mocked(waitForConfigAccess).mockResolvedValue('refused');

        const result = await siteAccessHandlers.waitForSiteAccess(makeContext(PROJECT));

        expect((result.data as SiteAccessChangeResult).notice.message).toMatch(/^Still refused/);
        expect(listSiteAccess).toHaveBeenCalledTimes(1);
    });

    it('sends a refused session to sign-in', async () => {
        withStorefront();
        jest.mocked(waitForConfigAccess).mockResolvedValue('unauthenticated');

        const result = await siteAccessHandlers.waitForSiteAccess(makeContext(PROJECT));

        expect((result.data as SiteAccessChangeResult).notice.message).toMatch(/Sign in to DA.live/);
    });
});

describe('openSiteAccessLink', () => {
    it('opens an allow-listed page', async () => {
        await siteAccessHandlers.openSiteAccessLink(makeContext(undefined), { id: 'github-email-settings' });

        expect(openUrl).toHaveBeenCalledWith('https://github.com/settings/emails');
    });

    it.each(['https://evil.example', 'constructor', '__proto__'])('refuses %s', async (id) => {
        const result = await siteAccessHandlers.openSiteAccessLink(makeContext(undefined), {
            id: id as 'code-sync-app',
        });

        expect(result.success).toBe(false);
        expect(openUrl).not.toHaveBeenCalled();
    });
});

it('repairSiteConfiguration runs the repair command', async () => {
    await siteAccessHandlers.repairSiteConfiguration(makeContext(PROJECT));

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.repairSiteConfiguration');
});
