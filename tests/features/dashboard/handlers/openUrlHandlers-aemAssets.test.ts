/**
 * handleOpenAemAssets — the More menu's "AEM Assets" (EDS-21).
 *
 * Opens the Assets console on the AEM author `demoBuilder.daLive.aemAuthorUrl` binds
 * the Assets panel to. The setting is stored as a bare host (what `daLiveSiteConfig.ts`
 * writes as `aem.repositoryId`), but a pasted origin is tolerated. When nothing is bound
 * the handler mirrors `handleOpenAdminPanel`: it offers the setting instead of failing.
 */

import * as vscode from 'vscode';
import {
    handleOpenAemAssets,
    resolveAemAssetsUrl,
} from '@/features/dashboard/handlers/openUrlHandlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { opened, settingReads } from './openUrlHandlers.testUtils';

const HOST = 'author-p1-e1.adobeaemcloud.com';
const ASSETS = `https://${HOST}/assets.html/content/dam`;

beforeEach(() => {
    jest.clearAllMocks();
    vscode.window.showInformationMessage = jest.fn().mockResolvedValue(undefined);
});

describe('resolveAemAssetsUrl', () => {
    it.each([
        ['a bare host', HOST],
        ['an origin with a scheme', `https://${HOST}`],
        ['a trailing slash', `${HOST}/`],
        ['surrounding whitespace', `  ${HOST}  `],
    ])('builds the Assets console URL from %s', (_label, setting) => {
        expect(resolveAemAssetsUrl(setting)).toBe(ASSETS);
    });

    it.each([undefined, '', '   '])('is undefined when the setting is %p', (setting) => {
        expect(resolveAemAssetsUrl(setting)).toBeUndefined();
    });
});

describe('handleOpenAemAssets', () => {
    it('opens the Assets console on the bound author', async () => {
        settingReads(HOST);

        await expect(handleOpenAemAssets(createMockHandlerContext(), undefined)).resolves.toEqual({
            success: true,
        });

        expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('demoBuilder.daLive');
        expect(opened()).toBe(ASSETS);
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('offers the setting instead of a browser when no author is bound', async () => {
        settingReads(undefined);
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Open Settings');

        const result = await handleOpenAemAssets(createMockHandlerContext(), undefined);

        expect(result).toEqual({ success: true });
        expect(vscode.env.openExternal).not.toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('demoBuilder.daLive.aemAuthorUrl'),
            'Open Settings'
        );
        // The notification is fire-and-forget; let its then-chain run.
        await Promise.resolve();
        await Promise.resolve();
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'workbench.action.openSettings',
            'demoBuilder.daLive.aemAuthorUrl'
        );
    });
});
