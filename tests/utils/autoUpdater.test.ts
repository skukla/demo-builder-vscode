/**
 * AutoUpdater (background checker) - channel safety
 *
 * The silent 4-hour background checker must never serve -alpha.* builds:
 * beta excludes alpha, and early-access collapses to beta because the
 * background path has no collaborator gate/token.
 */

jest.mock('axios');
jest.mock('vscode', () => ({
    workspace: { getConfiguration: jest.fn() },
    window: { showInformationMessage: jest.fn() },
    commands: { executeCommand: jest.fn() },
    Uri: { file: jest.fn((p: string) => ({ fsPath: p })) },
}), { virtual: true });
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        QUICK: 5000,
        AUTO_UPDATE_CHECK_INTERVAL: 14400000,
        AUTH: { BROWSER: 120000 },
    },
}));

import axios from 'axios';
import * as vscode from 'vscode';
import { AutoUpdater } from '@/utils/autoUpdater';

const mockedAxios = axios as jest.Mocked<typeof axios>;

function vsixAsset(tag: string) {
    return [
        {
            name: 'extension.vsix',
            browser_download_url: `https://github.com/test/repo/releases/download/${tag}/extension.vsix`,
        },
    ];
}

function arrayRelease(tag: string, draft = false) {
    return {
        tag_name: tag,
        draft,
        body: '',
        html_url: `https://github.com/test/repo/releases/${tag}`,
        published_at: '2024-01-01T00:00:00Z',
        assets: vsixAsset(tag),
    };
}

function makeContext(version: string): any {
    return { extension: { packageJSON: { version } } };
}

function makeLogger(): any {
    return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function setChannel(channel: string): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((_key: string, def?: any) => channel ?? def),
    });
}

const MIXED = [
    arrayRelease('v2.0.0-alpha.1'),
    arrayRelease('v1.2.0-beta.1'),
    arrayRelease('v1.1.0'),
];

describe('AutoUpdater - channel safety', () => {
    let updater: AutoUpdater;

    afterEach(() => {
        updater?.dispose();
        jest.clearAllMocks();
    });

    it('beta excludes alpha in the background path', async () => {
        setChannel('beta');
        mockedAxios.get.mockResolvedValue({ data: MIXED } as any);
        updater = new AutoUpdater(makeContext('1.0.0'), makeLogger());

        const result = await updater.checkForUpdates();

        expect(result?.version).toBe('1.2.0-beta.1');
    });

    it('early-access collapses to beta (never serves alpha silently)', async () => {
        setChannel('early-access');
        mockedAxios.get.mockResolvedValue({ data: MIXED } as any);
        updater = new AutoUpdater(makeContext('1.0.0'), makeLogger());

        const result = await updater.checkForUpdates();

        expect(result?.version).toBe('1.2.0-beta.1');
    });

    it('stable uses /releases/latest', async () => {
        setChannel('stable');
        mockedAxios.get.mockResolvedValue({ data: arrayRelease('v1.1.0') } as any);
        updater = new AutoUpdater(makeContext('1.0.0'), makeLogger());

        const result = await updater.checkForUpdates();

        expect(result?.version).toBe('1.1.0');
        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.stringContaining('/releases/latest'),
            expect.any(Object),
        );
    });

    it('returns undefined when no eligible release exists', async () => {
        setChannel('beta');
        mockedAxios.get.mockResolvedValue({ data: [] } as any);
        updater = new AutoUpdater(makeContext('1.0.0'), makeLogger());

        const result = await updater.checkForUpdates();

        expect(result).toBeUndefined();
    });
});
