/**
 * handleOpenAemAssets — the More menu's "AEM Assets" (EDS-21).
 *
 * Opens Assets View on experience.adobe.com for the AEM author
 * `demoBuilder.daLive.aemAuthorUrl` binds the Assets panel to (where the DA.live
 * picker's "Open in AEM Assets" goes), under the `demoBuilder.daLive.IMSOrgId` tenant.
 * The author is stored as a bare host (what `daLiveSiteConfig.ts` writes as
 * `aem.repositoryId`), but a pasted origin is tolerated. When nothing is bound
 * the handler mirrors `handleOpenAdminPanel`: it offers the setting instead of failing.
 */

import * as vscode from 'vscode';
import {
    handleOpenAemAssets,
    resolveAemAssetsUrl,
} from '@/features/dashboard/handlers/openUrlHandlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { opened, settingReads, settingsByKey } from './openUrlHandlers.testUtils';

const HOST = 'author-p1-e1.adobeaemcloud.com';
const ASSETS = `https://experience.adobe.com/?repoId=${HOST}#/assets/browse/content/dam`;
const ASSETS_IN_ORG = `https://experience.adobe.com/?repoId=${HOST}#/@demosystem/assets/browse/content/dam`;

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
    ])('builds the Assets View URL from %s', (_label, setting) => {
        expect(resolveAemAssetsUrl(setting)).toBe(ASSETS);
    });

    it('opens under the IMS org tenant when one is set', () => {
        expect(resolveAemAssetsUrl(HOST, ' demosystem ')).toBe(ASSETS_IN_ORG);
    });

    it('leaves the tenant to the shell when the org is blank', () => {
        expect(resolveAemAssetsUrl(HOST, '  ')).toBe(ASSETS);
    });

    it.each([undefined, '', '   '])('is undefined when the setting is %p', (setting) => {
        expect(resolveAemAssetsUrl(setting)).toBeUndefined();
    });
});

describe('handleOpenAemAssets', () => {
    it('opens Assets View on the bound author, in the configured org', async () => {
        settingsByKey({ aemAuthorUrl: HOST, IMSOrgId: 'demosystem' });

        await expect(handleOpenAemAssets(createMockHandlerContext(), undefined)).resolves.toEqual({
            success: true,
        });

        expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('demoBuilder.daLive');
        expect(opened()).toBe(ASSETS_IN_ORG);
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
