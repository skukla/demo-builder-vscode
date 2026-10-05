/**
 * ShowSiteAccessCommand — the Site access webview behind `demoBuilder.manageSiteAccess`.
 *
 * Load-bearing: every handler type is registered (an unregistered type is
 * silence — the request hangs to its timeout), and the first frame says whether
 * the open project has a storefront, which decides whether the screen asks for
 * an org and site.
 */

jest.mock('@/core/handlers/dispatchHandler', () => ({
    ...jest.requireActual('@/core/handlers/dispatchHandler'),
    dispatchHandler: jest.fn(async () => ({ success: true })),
}));
jest.mock('@/commands/handlerContextFactory', () => ({
    createPanelHandlerContext: jest.fn(() => ({ marker: 'panel-context' })),
}));
jest.mock('@/types/typeGuards', () => ({
    ...jest.requireActual('@/types/typeGuards'),
    getEdsRepoParts: jest.fn(),
}));
jest.mock('@/core/communication/webviewCommunicationManager');

import * as vscode from 'vscode';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import { ShowSiteAccessCommand } from '@/features/eds/commands/showSiteAccess';
import { siteAccessHandlers } from '@/features/eds/handlers/siteAccessHandlers';
import type { StateManager } from '@/core/state/stateManager';
import type { Project } from '@/types/base';
import { getEdsRepoParts } from '@/types/typeGuards';
import type { SiteAccessInitialData } from '@/types/webviewPayloads';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

type Internals = {
    getWebviewId(): string;
    getInitialData(): Promise<SiteAccessInitialData>;
    initializeMessageHandlers(comm: { onStreaming: jest.Mock }): void;
};

function makeCommand(project: Project | null): ShowSiteAccessCommand & Internals {
    const stateManager = createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) });
    return new ShowSiteAccessCommand(
        createMockExtensionContext(),
        stateManager as unknown as StateManager,
        createMockLogger(),
    ) as ShowSiteAccessCommand & Internals;
}

beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(vscode.window, 'activeColorTheme', {
        value: { kind: vscode.ColorThemeKind.Dark },
        configurable: true,
    });
});

it('is its own webview', () => {
    expect(makeCommand(null).getWebviewId()).toBe('demoBuilder.siteAccess');
});

it('registers every handler in the map, each dispatching into it', async () => {
    const comm = { onStreaming: jest.fn() };
    makeCommand(null).initializeMessageHandlers(comm);

    const registered = comm.onStreaming.mock.calls.map((call) => call[0]).sort();
    expect(registered).toEqual([...getRegisteredTypes(siteAccessHandlers)].sort());
    expect(registered).toContain('waitForSiteAccess');

    await comm.onStreaming.mock.calls[0][1]({ email: 'a@x.example' });
    expect(dispatchHandler).toHaveBeenCalledWith(
        siteAccessHandlers,
        { marker: 'panel-context' },
        comm.onStreaming.mock.calls[0][0],
        { email: 'a@x.example' },
    );
});

it('opens with no project: nothing to administer, so the screen asks for a site', async () => {
    jest.mocked(getEdsRepoParts).mockReturnValue(undefined);

    await expect(makeCommand(null).getInitialData()).resolves.toEqual({
        theme: 'dark',
        projectName: '',
        hasStorefront: false,
    });
});

it('opens on a storefront project with both lists to show', async () => {
    jest.mocked(getEdsRepoParts).mockReturnValue({ owner: 'acme', repo: 'shop' });
    const project = createMockProject({ name: 'shop-demo', title: 'Shop Demo' });

    const init = await makeCommand(project).getInitialData();

    expect(getEdsRepoParts).toHaveBeenCalledWith(project);
    expect(init.hasStorefront).toBe(true);
    expect(init.projectName).toBe('Shop Demo');
});
